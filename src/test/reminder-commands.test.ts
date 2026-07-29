import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReminderCommands } from '@/modules/reminders/application/reminder.commands';
import type { ReminderRepository } from '@/modules/reminders/application/reminder.repository';
import type { EventRepository } from '@/platform/events/event.repository';
import type { Reminder } from '@/modules/reminders/domain/reminder.schema';

const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const REMINDER_ID = '22222222-2222-4222-8222-222222222222';

function makeReminderRepo(initial: Reminder[] = []) {
  const rows = new Map(initial.map((r) => [r.id, r]));
  const repo: ReminderRepository = {
    findById: vi.fn(async (id: string) => rows.get(id) ?? null),
    findPendingPushReminderByItem: vi.fn(async (itemId: string) => {
      for (const r of rows.values()) {
        if (r.itemId === itemId && r.channel === 'push' && r.status === 'pending') return r;
      }
      return null;
    }),
    save: vi.fn(async (r: Reminder) => {
      rows.set(r.id, r);
    }),
  };
  return { repo, rows };
}

function makeEventRepo() {
  const events: unknown[] = [];
  const repo: EventRepository = {
    save: vi.fn(async (e) => {
      events.push(e);
    }),
    findAll: vi.fn(async () => []),
    findMigrationCompletedAt: vi.fn(async () => null),
    findByEntityId: vi.fn(async () => []),
  };
  return { repo, events };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-29T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ReminderCommands.setTaskReminder', () => {
  it('cria um lembrete futuro e emite reminder.created', async () => {
    const { repo, rows } = makeReminderRepo();
    const { repo: eventRepo, events } = makeEventRepo();
    const commands = new ReminderCommands(repo, eventRepo);

    const reminder = await commands.setTaskReminder(ITEM_ID, 'ws-1', '2026-07-29T15:00:00.000Z');

    expect(reminder.status).toBe('pending');
    expect(reminder.channel).toBe('push');
    expect(rows.get(reminder.id)).toEqual(reminder);
    expect(events).toHaveLength(1);
    expect((events[0] as { type: string }).type).toBe('reminder.created');
  });

  it('impede lembrete no passado', async () => {
    const { repo } = makeReminderRepo();
    const { repo: eventRepo } = makeEventRepo();
    const commands = new ReminderCommands(repo, eventRepo);

    await expect(commands.setTaskReminder(ITEM_ID, 'ws-1', '2026-07-29T10:00:00.000Z')).rejects.toThrow(
      /futur/
    );
  });

  it('impede lembrete no exato instante atual (não estritamente futuro)', async () => {
    const { repo } = makeReminderRepo();
    const { repo: eventRepo } = makeEventRepo();
    const commands = new ReminderCommands(repo, eventRepo);

    await expect(commands.setTaskReminder(ITEM_ID, 'ws-1', '2026-07-29T12:00:00.000Z')).rejects.toThrow();
  });

  it('uma segunda chamada reagenda o lembrete existente em vez de criar outro (máx. 1 por item)', async () => {
    const existing: Reminder = {
      id: REMINDER_ID,
      workspaceId: 'ws-1',
      itemId: ITEM_ID,
      message: 'Lembrete de tarefa',
      remindAt: '2026-07-29T15:00:00.000Z',
      channel: 'push',
      status: 'pending',
      createdAt: '2026-07-29T11:00:00.000Z',
      updatedAt: '2026-07-29T11:00:00.000Z',
    };
    const { repo, rows } = makeReminderRepo([existing]);
    const { repo: eventRepo, events } = makeEventRepo();
    const commands = new ReminderCommands(repo, eventRepo);

    const updated = await commands.setTaskReminder(ITEM_ID, 'ws-1', '2026-07-29T18:00:00.000Z');

    expect(updated.id).toBe(REMINDER_ID);
    expect(updated.remindAt).toBe('2026-07-29T18:00:00.000Z');
    expect(rows.size).toBe(1);
    expect((events[0] as { type: string }).type).toBe('reminder.rescheduled');
  });
});

describe('ReminderCommands.cancelReminder', () => {
  it('cancela um lembrete pendente e emite reminder.cancelled', async () => {
    const existing: Reminder = {
      id: REMINDER_ID,
      workspaceId: 'ws-1',
      itemId: ITEM_ID,
      message: 'Lembrete de tarefa',
      remindAt: '2026-07-29T15:00:00.000Z',
      channel: 'push',
      status: 'pending',
      createdAt: '2026-07-29T11:00:00.000Z',
      updatedAt: '2026-07-29T11:00:00.000Z',
    };
    const { repo, rows } = makeReminderRepo([existing]);
    const { repo: eventRepo, events } = makeEventRepo();
    const commands = new ReminderCommands(repo, eventRepo);

    const cancelled = await commands.cancelReminder(REMINDER_ID);

    expect(cancelled.status).toBe('cancelled');
    expect(rows.get(REMINDER_ID)?.status).toBe('cancelled');
    expect((events[0] as { type: string }).type).toBe('reminder.cancelled');
  });

  it('lança erro compreensível quando o lembrete não existe', async () => {
    const { repo } = makeReminderRepo();
    const { repo: eventRepo } = makeEventRepo();
    const commands = new ReminderCommands(repo, eventRepo);

    await expect(commands.cancelReminder('inexistente')).rejects.toThrow('não encontrado');
  });
});

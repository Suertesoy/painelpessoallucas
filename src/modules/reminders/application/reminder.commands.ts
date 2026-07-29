import { ReminderRepository } from './reminder.repository';
import { EventRepository } from '@/platform/events/event.repository';
import { Reminder, ReminderSchema } from '../domain/reminder.schema';

const DEFAULT_MESSAGE = 'Lembrete de tarefa';

export class ReminderCommands {
  constructor(
    private reminderRepo: ReminderRepository,
    private eventRepo: EventRepository
  ) {}

  /**
   * Cria (ou edita, se já houver um pendente) o lembrete push de um item.
   * Mantém no máximo um lembrete push pendente por tarefa: uma segunda
   * chamada reagenda o mesmo lembrete em vez de criar outro.
   */
  async setTaskReminder(
    itemId: string,
    workspaceId: string,
    remindAt: string,
    message?: string
  ): Promise<Reminder> {
    if (new Date(remindAt).getTime() <= Date.now()) {
      throw new Error('O lembrete precisa ser para uma data e horário futuros.');
    }

    const now = new Date().toISOString();
    const existing = await this.reminderRepo.findPendingPushReminderByItem(itemId);

    if (existing) {
      const previousRemindAt = existing.remindAt;
      const updated: Reminder = {
        ...existing,
        remindAt,
        message: message?.trim() || existing.message,
        updatedAt: now,
      };
      ReminderSchema.parse(updated);
      await this.reminderRepo.save(updated);
      await this.eventRepo.save({
        id: crypto.randomUUID(),
        type: 'reminder.rescheduled',
        entityId: updated.id,
        workspaceId,
        source: 'manual',
        payload: { previousRemindAt, newRemindAt: remindAt },
        createdAt: now,
      });
      return updated;
    }

    const reminder: Reminder = {
      id: crypto.randomUUID(),
      workspaceId,
      itemId,
      message: message?.trim() || DEFAULT_MESSAGE,
      remindAt,
      channel: 'push',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    ReminderSchema.parse(reminder);
    await this.reminderRepo.save(reminder);
    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'reminder.created',
      entityId: reminder.id,
      workspaceId,
      source: 'manual',
      payload: reminder,
      createdAt: now,
    });
    return reminder;
  }

  async cancelReminder(reminderId: string): Promise<Reminder> {
    const existing = await this.reminderRepo.findById(reminderId);
    if (!existing) throw new Error('Lembrete não encontrado.');

    const now = new Date().toISOString();
    const updated: Reminder = { ...existing, status: 'cancelled', updatedAt: now };
    ReminderSchema.parse(updated);
    await this.reminderRepo.save(updated);
    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'reminder.cancelled',
      entityId: updated.id,
      workspaceId: updated.workspaceId,
      source: 'manual',
      payload: {},
      createdAt: now,
    });
    return updated;
  }
}

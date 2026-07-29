// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }));

process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'pub-key';
process.env.VAPID_PRIVATE_KEY = 'priv-key';
process.env.VAPID_SUBJECT = 'mailto:test@example.com';

type Row = Record<string, unknown>;

function filterChain(getRows: () => Row[]) {
  const filters: Array<(r: Row) => boolean> = [];
  let limitN: number | undefined;
  const apply = () => {
    let rows = getRows().filter((r) => filters.every((f) => f(r)));
    if (limitN != null) rows = rows.slice(0, limitN);
    return rows;
  };
  const chain = {
    eq(col: string, val: unknown) {
      filters.push((r) => r[col] === val);
      return chain;
    },
    not(col: string, _op: string, val: unknown) {
      filters.push((r) => r[col] !== val);
      return chain;
    },
    is(col: string, val: null) {
      filters.push((r) => r[col] === val);
      return chain;
    },
    gte(col: string, val: unknown) {
      filters.push((r) => (r[col] as string) >= (val as string));
      return chain;
    },
    lte(col: string, val: unknown) {
      filters.push((r) => (r[col] as string) <= (val as string));
      return chain;
    },
    limit(n: number) {
      limitN = n;
      return chain;
    },
    async maybeSingle() {
      const rows = apply();
      return { data: rows[0] ?? null, error: null };
    },
    then(resolve: (v: { data: Row[]; error: null }) => void) {
      resolve({ data: apply(), error: null });
    },
  };
  return chain;
}

function updateChain(getRows: () => Row[], patch: Row) {
  const filters: Array<(r: Row) => boolean> = [];
  const chain = {
    eq(col: string, val: unknown) {
      filters.push((r) => r[col] === val);
      return chain;
    },
    then(resolve: (v: { error: null }) => void) {
      for (const r of getRows()) if (filters.every((f) => f(r))) Object.assign(r, patch);
      resolve({ error: null });
    },
  };
  return chain;
}

function makeFakeAdmin() {
  const reminders = new Map<string, Row>();
  const items = new Map<string, Row>();
  const calendarLinks = new Map<string, Row>();
  const subscriptions = new Map<string, Row>();
  const aiRuns = new Map<string, Row>();
  const notifications = new Map<string, Row>();
  const deliveries = new Map<string, Row>();
  let seq = 0;
  const newId = (p: string) => `${p}-${++seq}`;

  const admin = {
    from(table: string) {
      if (table === 'reminders') {
        return {
          select: () => filterChain(() => [...reminders.values()]),
          update: (patch: Row) => updateChain(() => [...reminders.values()], patch),
        };
      }
      if (table === 'items') {
        return { select: () => filterChain(() => [...items.values()]) };
      }
      if (table === 'calendar_event_links') {
        return { select: () => filterChain(() => [...calendarLinks.values()]) };
      }
      if (table === 'push_subscriptions') {
        return {
          select: () => filterChain(() => [...subscriptions.values()]),
          update: (patch: Row) => updateChain(() => [...subscriptions.values()], patch),
        };
      }
      if (table === 'ai_runs') {
        return { select: () => filterChain(() => [...aiRuns.values()]) };
      }
      if (table === 'notifications') {
        return {
          insert: (row: Row) => ({
            select: () => ({
              async maybeSingle() {
                if (row.dedup_key) {
                  const existing = [...notifications.values()].find(
                    (n) => n.workspace_id === row.workspace_id && n.dedup_key === row.dedup_key
                  );
                  if (existing) return { data: null, error: { code: '23505' } };
                }
                const id = newId('notif');
                notifications.set(id, { id, ...row });
                return { data: { id }, error: null };
              },
            }),
          }),
          select: () => filterChain(() => [...notifications.values()]),
        };
      }
      if (table === 'push_deliveries') {
        return {
          async insert(row: Row) {
            const existing = [...deliveries.values()].find(
              (d) => d.notification_id === row.notification_id && d.subscription_id === row.subscription_id
            );
            if (existing) return { error: { code: '23505' } };
            const id = newId('delivery');
            deliveries.set(id, { id, status: 'pending', attempt: 0, ...row });
            return { error: null };
          },
        };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  };

  return { admin, reminders, items, calendarLinks, subscriptions, aiRuns, notifications, deliveries, newId };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('processDueTaskReminders', () => {
  it('lembrete futuro: não é processado antes da hora', async () => {
    const { processDueTaskReminders } = await import('@/platform/push/push-tick');
    const fake = makeFakeAdmin();
    const now = new Date('2026-07-29T12:00:00.000Z');
    fake.reminders.set('r1', {
      id: 'r1',
      workspace_id: 'ws-1',
      item_id: 'i1',
      channel: 'push',
      status: 'pending',
      remind_at: '2026-07-29T13:00:00.000Z',
    });
    const result = await processDueTaskReminders(fake.admin as never, 'ws-1', now);
    expect(result).toEqual({ notified: 0, skippedByCalendar: 0 });
  });

  it('lembrete vencido sem vínculo de calendário: notifica e marca como sent', async () => {
    const { processDueTaskReminders } = await import('@/platform/push/push-tick');
    const fake = makeFakeAdmin();
    fake.reminders.set('r1', {
      id: 'r1',
      workspace_id: 'ws-1',
      item_id: 'i1',
      channel: 'push',
      status: 'pending',
      remind_at: '2026-07-29T11:00:00.000Z',
    });
    fake.items.set('i1', { id: 'i1', title: 'Tarefa X', calendar_sync: 'none', deleted_at: null });
    fake.subscriptions.set('sub-1', {
      id: 'sub-1',
      workspace_id: 'ws-1',
      is_active: true,
      disabled_at: null,
      task_reminders_enabled: true,
    });

    const result = await processDueTaskReminders(fake.admin as never, 'ws-1', new Date('2026-07-29T12:00:00.000Z'));
    expect(result).toEqual({ notified: 1, skippedByCalendar: 0 });
    expect(fake.reminders.get('r1')?.status).toBe('sent');
    expect(fake.deliveries.size).toBe(1);
  });

  it('não duplica com o Google Calendar: item com lembrete nativo confirmado é pulado', async () => {
    const { processDueTaskReminders } = await import('@/platform/push/push-tick');
    const fake = makeFakeAdmin();
    fake.reminders.set('r1', {
      id: 'r1',
      workspace_id: 'ws-1',
      item_id: 'i1',
      channel: 'push',
      status: 'pending',
      remind_at: '2026-07-29T11:00:00.000Z',
    });
    fake.items.set('i1', { id: 'i1', title: 'Reunião', calendar_sync: 'sync_reminder', deleted_at: null });
    fake.calendarLinks.set('link-1', { item_id: 'i1', sync_status: 'synced', reminders_minutes: [15] });

    const result = await processDueTaskReminders(fake.admin as never, 'ws-1', new Date('2026-07-29T12:00:00.000Z'));
    expect(result).toEqual({ notified: 0, skippedByCalendar: 1 });
    expect(fake.reminders.get('r1')?.status).toBe('sent');
    expect(fake.deliveries.size).toBe(0);
  });

  it('entrega permitida quando o vínculo existe mas ainda está pending (Google não confirmou)', async () => {
    const { processDueTaskReminders } = await import('@/platform/push/push-tick');
    const fake = makeFakeAdmin();
    fake.reminders.set('r1', {
      id: 'r1',
      workspace_id: 'ws-1',
      item_id: 'i1',
      channel: 'push',
      status: 'pending',
      remind_at: '2026-07-29T11:00:00.000Z',
    });
    fake.items.set('i1', { id: 'i1', title: 'Reunião', calendar_sync: 'sync_reminder', deleted_at: null });
    fake.calendarLinks.set('link-1', { item_id: 'i1', sync_status: 'pending', reminders_minutes: [] });
    fake.subscriptions.set('sub-1', {
      id: 'sub-1',
      workspace_id: 'ws-1',
      is_active: true,
      disabled_at: null,
      task_reminders_enabled: true,
    });

    const result = await processDueTaskReminders(fake.admin as never, 'ws-1', new Date('2026-07-29T12:00:00.000Z'));
    expect(result).toEqual({ notified: 1, skippedByCalendar: 0 });
  });
});

describe('processDailyPlanningNotices', () => {
  it('envia só após o horário configurado, no fuso do dispositivo', async () => {
    const { processDailyPlanningNotices } = await import('@/platform/push/push-tick');
    const fake = makeFakeAdmin();
    fake.subscriptions.set('sub-1', {
      id: 'sub-1',
      workspace_id: 'ws-1',
      is_active: true,
      disabled_at: null,
      daily_planning_enabled: true,
      timezone: 'America/Sao_Paulo',
      daily_planning_time: '08:00',
    });

    // 10:30 UTC = 07:30 em São Paulo — ainda não chegou a hora.
    const before = await processDailyPlanningNotices(fake.admin as never, 'ws-1', new Date('2026-07-29T10:30:00.000Z'));
    expect(before.created).toBe(0);

    // 11:00 UTC = 08:00 em São Paulo — na hora.
    const after = await processDailyPlanningNotices(fake.admin as never, 'ws-1', new Date('2026-07-29T11:00:00.000Z'));
    expect(after.created).toBe(1);
  });

  it('idempotente por dispositivo e data local: não duplica no mesmo dia', async () => {
    const { processDailyPlanningNotices } = await import('@/platform/push/push-tick');
    const fake = makeFakeAdmin();
    fake.subscriptions.set('sub-1', {
      id: 'sub-1',
      workspace_id: 'ws-1',
      is_active: true,
      disabled_at: null,
      daily_planning_enabled: true,
      timezone: 'America/Sao_Paulo',
      daily_planning_time: '08:00',
    });

    const now = new Date('2026-07-29T12:00:00.000Z');
    await processDailyPlanningNotices(fake.admin as never, 'ws-1', now);
    const second = await processDailyPlanningNotices(fake.admin as never, 'ws-1', now);
    expect(second.created).toBe(0);
    expect(fake.deliveries.size).toBe(1);
  });
});

describe('processWeeklyReviewNotices', () => {
  it('só dispara no dia da semana configurado (fuso do dispositivo)', async () => {
    const { processWeeklyReviewNotices } = await import('@/platform/push/push-tick');
    const fake = makeFakeAdmin();
    fake.subscriptions.set('sub-1', {
      id: 'sub-1',
      workspace_id: 'ws-1',
      is_active: true,
      disabled_at: null,
      weekly_review_enabled: true,
      timezone: 'America/Sao_Paulo',
      weekly_review_day: 0, // domingo
      weekly_review_time: '09:00',
    });

    // 2026-07-29 é quarta-feira em São Paulo — não dispara.
    const wrongDay = await processWeeklyReviewNotices(
      fake.admin as never,
      'ws-1',
      new Date('2026-07-29T13:00:00.000Z')
    );
    expect(wrongDay.created).toBe(0);

    // 2026-08-02 é domingo.
    const rightDay = await processWeeklyReviewNotices(
      fake.admin as never,
      'ws-1',
      new Date('2026-08-02T13:00:00.000Z')
    );
    expect(rightDay.created).toBe(1);
  });

  it('respeita o horário mesmo no dia certo', async () => {
    const { processWeeklyReviewNotices } = await import('@/platform/push/push-tick');
    const fake = makeFakeAdmin();
    fake.subscriptions.set('sub-1', {
      id: 'sub-1',
      workspace_id: 'ws-1',
      is_active: true,
      disabled_at: null,
      weekly_review_enabled: true,
      timezone: 'America/Sao_Paulo',
      weekly_review_day: 0,
      weekly_review_time: '09:00',
    });

    // Domingo, 10:00 UTC = 07:00 em SP — ainda não chegou a hora.
    const early = await processWeeklyReviewNotices(fake.admin as never, 'ws-1', new Date('2026-08-02T10:00:00.000Z'));
    expect(early.created).toBe(0);
  });
});

describe('recoverCaptureFailureNotifications', () => {
  it('cria notificação para falha de captura ainda não notificada', async () => {
    const { recoverCaptureFailureNotifications } = await import('@/platform/push/push-tick');
    const fake = makeFakeAdmin();
    fake.aiRuns.set('run-1', {
      id: 'run-1',
      workspace_id: 'ws-1',
      operation: 'capture_triage',
      status: 'failed',
      item_id: 'i1',
      created_at: '2026-07-29T10:00:00.000Z',
    });
    fake.items.set('i1', { id: 'i1', source: 'audio_capture', deleted_at: null });
    fake.subscriptions.set('sub-1', {
      id: 'sub-1',
      workspace_id: 'ws-1',
      is_active: true,
      disabled_at: null,
      capture_failure_enabled: true,
    });

    const result = await recoverCaptureFailureNotifications(
      fake.admin as never,
      'ws-1',
      new Date('2026-07-29T12:00:00.000Z')
    );
    expect(result.created).toBe(1);
  });

  it('ignora falha de operação genérica (não é capture_triage)', async () => {
    const { recoverCaptureFailureNotifications } = await import('@/platform/push/push-tick');
    const fake = makeFakeAdmin();
    fake.aiRuns.set('run-1', {
      id: 'run-1',
      workspace_id: 'ws-1',
      operation: 'plan_import',
      status: 'failed',
      item_id: null,
      created_at: '2026-07-29T10:00:00.000Z',
    });

    const result = await recoverCaptureFailureNotifications(
      fake.admin as never,
      'ws-1',
      new Date('2026-07-29T12:00:00.000Z')
    );
    expect(result.created).toBe(0);
  });

  it('ignora item que não é uma captura analisável (source diferente)', async () => {
    const { recoverCaptureFailureNotifications } = await import('@/platform/push/push-tick');
    const fake = makeFakeAdmin();
    fake.aiRuns.set('run-1', {
      id: 'run-1',
      workspace_id: 'ws-1',
      operation: 'capture_triage',
      status: 'failed',
      item_id: 'i1',
      created_at: '2026-07-29T10:00:00.000Z',
    });
    fake.items.set('i1', { id: 'i1', source: 'manual', deleted_at: null });

    const result = await recoverCaptureFailureNotifications(
      fake.admin as never,
      'ws-1',
      new Date('2026-07-29T12:00:00.000Z')
    );
    expect(result.created).toBe(0);
  });

  it('idempotente: não recria notificação já existente para a mesma execução', async () => {
    const { recoverCaptureFailureNotifications } = await import('@/platform/push/push-tick');
    const fake = makeFakeAdmin();
    fake.aiRuns.set('run-1', {
      id: 'run-1',
      workspace_id: 'ws-1',
      operation: 'capture_triage',
      status: 'failed',
      item_id: 'i1',
      created_at: '2026-07-29T10:00:00.000Z',
    });
    fake.items.set('i1', { id: 'i1', source: 'quick_capture', deleted_at: null });
    fake.subscriptions.set('sub-1', {
      id: 'sub-1',
      workspace_id: 'ws-1',
      is_active: true,
      disabled_at: null,
      capture_failure_enabled: true,
    });

    const now = new Date('2026-07-29T12:00:00.000Z');
    await recoverCaptureFailureNotifications(fake.admin as never, 'ws-1', now);
    await recoverCaptureFailureNotifications(fake.admin as never, 'ws-1', now);
    expect(fake.notifications.size).toBe(1);
  });
});

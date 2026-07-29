// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'pub-key';
process.env.VAPID_PRIVATE_KEY = 'priv-key';
process.env.VAPID_SUBJECT = 'mailto:test@example.com';

type Row = Record<string, unknown>;

function rowMatcher(col: string, val: unknown) {
  if (col.includes('.')) {
    const [rel, field] = col.split('.');
    return (r: Row) => {
      const nested = r[rel] as Row | null | undefined;
      return !!nested && nested[field] === val;
    };
  }
  return (r: Row) => r[col] === val;
}

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
      filters.push(rowMatcher(col, val));
      return chain;
    },
    is(col: string, val: null) {
      filters.push((r) => r[col] === val);
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
      for (const r of getRows()) {
        if (filters.every((f) => f(r))) Object.assign(r, patch);
      }
      resolve({ error: null });
    },
  };
  return chain;
}

function makeFakeAdmin() {
  const notifications = new Map<string, Row>();
  const subscriptions = new Map<string, Row>();
  const deliveries = new Map<string, Row>();
  let seq = 0;
  const newId = (prefix: string) => `${prefix}-${++seq}`;

  function shapedDeliveries(): Row[] {
    return [...deliveries.values()].map((d) => ({
      ...d,
      notification: notifications.get(d.notification_id as string) ?? null,
      subscription: subscriptions.get(d.subscription_id as string) ?? null,
    }));
  }

  const admin = {
    from(table: string) {
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
      if (table === 'push_subscriptions') {
        return {
          select: () => filterChain(() => [...subscriptions.values()]),
          update: (patch: Row) => updateChain(() => [...subscriptions.values()], patch),
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
            deliveries.set(id, {
              id,
              attempt: 0,
              next_attempt_at: new Date(0).toISOString(),
              status: 'pending',
              ...row,
            });
            return { error: null };
          },
          select: () => filterChain(shapedDeliveries),
          update: (patch: Row) => updateChain(() => [...deliveries.values()], patch),
        };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  };

  return { admin, notifications, subscriptions, deliveries, newId };
}

function makeSubscription(fake: ReturnType<typeof makeFakeAdmin>, overrides: Row = {}) {
  const id = fake.newId('sub');
  fake.subscriptions.set(id, {
    id,
    workspace_id: 'ws-1',
    endpoint: `https://push.example/${id}`,
    p256dh: 'p256dh-key',
    auth_key: 'auth-key',
    is_active: true,
    disabled_at: null,
    show_details_enabled: false,
    task_reminders_enabled: true,
    daily_planning_enabled: false,
    weekly_review_enabled: false,
    capture_failure_enabled: false,
    ...overrides,
  });
  return id;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('createDeliveriesForWorkspace', () => {
  it('cria uma entrega para cada assinatura ativa elegível do workspace', async () => {
    const { createDeliveriesForWorkspace } = await import('@/platform/push/push-dispatch');
    const fake = makeFakeAdmin();
    makeSubscription(fake, { task_reminders_enabled: true });
    makeSubscription(fake, { task_reminders_enabled: false }); // não elegível
    makeSubscription(fake, { task_reminders_enabled: true, is_active: false }); // desativada

    const result = await createDeliveriesForWorkspace(fake.admin as never, {
      workspaceId: 'ws-1',
      category: 'task_reminder',
      dedupKey: 'task_reminder:r1',
      targetUrl: '/entrada?item=i1',
      itemTitle: 'Tarefa X',
    });

    expect(result.created).toBe(1);
    expect(fake.deliveries.size).toBe(1);
    expect(fake.notifications.size).toBe(1);
  });

  it('idempotente: chamar duas vezes com a mesma dedup_key não duplica notificação nem entregas', async () => {
    const { createDeliveriesForWorkspace } = await import('@/platform/push/push-dispatch');
    const fake = makeFakeAdmin();
    makeSubscription(fake, { task_reminders_enabled: true });

    const params = {
      workspaceId: 'ws-1',
      category: 'task_reminder' as const,
      dedupKey: 'task_reminder:r1',
      targetUrl: '/entrada?item=i1',
    };
    await createDeliveriesForWorkspace(fake.admin as never, params);
    await createDeliveriesForWorkspace(fake.admin as never, params);

    expect(fake.notifications.size).toBe(1);
    expect(fake.deliveries.size).toBe(1);
  });

  it('não duplica entrega para o mesmo par (notificação, assinatura)', async () => {
    const { createDeliveriesForWorkspace } = await import('@/platform/push/push-dispatch');
    const fake = makeFakeAdmin();
    makeSubscription(fake, { task_reminders_enabled: true, capture_failure_enabled: true });

    await createDeliveriesForWorkspace(fake.admin as never, {
      workspaceId: 'ws-1',
      category: 'capture_failure',
      dedupKey: 'capture_failure:run-1',
      targetUrl: '/entrada?item=i1',
    });
    await createDeliveriesForWorkspace(fake.admin as never, {
      workspaceId: 'ws-1',
      category: 'capture_failure',
      dedupKey: 'capture_failure:run-1',
      targetUrl: '/entrada?item=i1',
    });

    expect(fake.deliveries.size).toBe(1);
  });
});

describe('dispatchPendingDeliveries', () => {
  it('envia com sucesso e marca a entrega como sent', async () => {
    const webpush = (await import('web-push')).default;
    vi.mocked(webpush.sendNotification).mockResolvedValueOnce(undefined as never);

    const { createDeliveriesForWorkspace, dispatchPendingDeliveries } = await import('@/platform/push/push-dispatch');
    const fake = makeFakeAdmin();
    makeSubscription(fake, { task_reminders_enabled: true });
    await createDeliveriesForWorkspace(fake.admin as never, {
      workspaceId: 'ws-1',
      category: 'task_reminder',
      dedupKey: 'task_reminder:r1',
      targetUrl: '/entrada?item=i1',
      itemTitle: 'Tarefa X',
    });

    const result = await dispatchPendingDeliveries(fake.admin as never, 'ws-1');
    expect(result).toEqual({ sent: 1, failed: 0, cancelled: 0 });
    const delivery = [...fake.deliveries.values()][0];
    expect(delivery.status).toBe('sent');
    expect(delivery.sent_at).toBeTruthy();
  });

  it('reexecuções não reenviam uma entrega já concluída (sent)', async () => {
    const webpush = (await import('web-push')).default;
    vi.mocked(webpush.sendNotification).mockResolvedValue(undefined as never);

    const { createDeliveriesForWorkspace, dispatchPendingDeliveries } = await import('@/platform/push/push-dispatch');
    const fake = makeFakeAdmin();
    makeSubscription(fake, { task_reminders_enabled: true });
    await createDeliveriesForWorkspace(fake.admin as never, {
      workspaceId: 'ws-1',
      category: 'task_reminder',
      dedupKey: 'task_reminder:r1',
      targetUrl: '/entrada?item=i1',
    });

    await dispatchPendingDeliveries(fake.admin as never, 'ws-1');
    const second = await dispatchPendingDeliveries(fake.admin as never, 'ws-1');
    expect(second).toEqual({ sent: 0, failed: 0, cancelled: 0 });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('desativa a assinatura em resposta 410 e marca a entrega como failed', async () => {
    const webpush = (await import('web-push')).default;
    const err = Object.assign(new Error('gone'), { statusCode: 410 });
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(err as never);

    const { createDeliveriesForWorkspace, dispatchPendingDeliveries } = await import('@/platform/push/push-dispatch');
    const fake = makeFakeAdmin();
    const subId = makeSubscription(fake, { task_reminders_enabled: true });
    await createDeliveriesForWorkspace(fake.admin as never, {
      workspaceId: 'ws-1',
      category: 'task_reminder',
      dedupKey: 'task_reminder:r1',
      targetUrl: '/entrada?item=i1',
    });

    const result = await dispatchPendingDeliveries(fake.admin as never, 'ws-1');

    expect(result).toEqual({ sent: 0, failed: 1, cancelled: 0 });
    expect(fake.subscriptions.get(subId)?.is_active).toBe(false);
    expect(fake.subscriptions.get(subId)?.disabled_at).toBeTruthy();
    expect([...fake.deliveries.values()][0].status).toBe('failed');
  });

  it('cancela entregas pendentes do mesmo dispositivo já a partir da próxima leva (efeito em cascata)', async () => {
    const webpush = (await import('web-push')).default;
    const err = Object.assign(new Error('gone'), { statusCode: 410 });
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(err as never);

    const { createDeliveriesForWorkspace, createDeliveryForSubscription, dispatchPendingDeliveries } = await import(
      '@/platform/push/push-dispatch'
    );
    const fake = makeFakeAdmin();
    const subId = makeSubscription(fake, { task_reminders_enabled: true, daily_planning_enabled: true });
    await createDeliveriesForWorkspace(fake.admin as never, {
      workspaceId: 'ws-1',
      category: 'task_reminder',
      dedupKey: 'task_reminder:r1',
      targetUrl: '/entrada?item=i1',
    });
    const secondCreated = await createDeliveryForSubscription(fake.admin as never, subId, {
      workspaceId: 'ws-1',
      category: 'daily_planning',
      dedupKey: 'daily_planning:sub:2026-07-30',
      targetUrl: '/hoje',
    });
    expect(secondCreated.created).toBe(true);

    // Só processa 1 por vez, para isolar o efeito em cascata da desativação
    // sobre a entrega que ainda não tinha sido buscada nesta leva.
    const first = await dispatchPendingDeliveries(fake.admin as never, 'ws-1', 1);
    expect(first).toEqual({ sent: 0, failed: 1, cancelled: 0 });
    expect(fake.subscriptions.get(subId)?.is_active).toBe(false);

    const second = await dispatchPendingDeliveries(fake.admin as never, 'ws-1');
    expect(second).toEqual({ sent: 0, failed: 0, cancelled: 0 });
    const statuses = [...fake.deliveries.values()].map((d) => d.status).sort();
    expect(statuses).toEqual(['cancelled', 'failed']);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('erro temporário agenda nova tentativa (backoff) sem desativar a assinatura', async () => {
    const webpush = (await import('web-push')).default;
    const err = Object.assign(new Error('network blip'), { statusCode: undefined });
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(err as never);

    const { createDeliveriesForWorkspace, dispatchPendingDeliveries } = await import('@/platform/push/push-dispatch');
    const fake = makeFakeAdmin();
    const subId = makeSubscription(fake, { task_reminders_enabled: true });
    await createDeliveriesForWorkspace(fake.admin as never, {
      workspaceId: 'ws-1',
      category: 'task_reminder',
      dedupKey: 'task_reminder:r1',
      targetUrl: '/entrada?item=i1',
    });

    await dispatchPendingDeliveries(fake.admin as never, 'ws-1');

    expect(fake.subscriptions.get(subId)?.is_active).toBe(true);
    const delivery = [...fake.deliveries.values()][0];
    expect(delivery.status).toBe('pending');
    expect(delivery.attempt).toBe(1);
    expect(new Date(delivery.next_attempt_at as string).getTime()).toBeGreaterThan(Date.now());
  });

  it('após esgotar as tentativas (limite 3), marca a entrega como failed permanentemente', async () => {
    const webpush = (await import('web-push')).default;
    const err = Object.assign(new Error('server error'), { statusCode: 500 });
    vi.mocked(webpush.sendNotification).mockRejectedValue(err as never);

    const { PUSH_MAX_ATTEMPTS, createDeliveriesForWorkspace, dispatchPendingDeliveries } = await import(
      '@/platform/push/push-dispatch'
    );
    const fake = makeFakeAdmin();
    makeSubscription(fake, { task_reminders_enabled: true });
    await createDeliveriesForWorkspace(fake.admin as never, {
      workspaceId: 'ws-1',
      category: 'task_reminder',
      dedupKey: 'task_reminder:r1',
      targetUrl: '/entrada?item=i1',
    });

    for (let i = 0; i < PUSH_MAX_ATTEMPTS; i += 1) {
      // Força a reavaliação imediata (ignora o backoff agendado) definindo
      // next_attempt_at no passado antes de cada tentativa subsequente.
      for (const d of fake.deliveries.values()) d.next_attempt_at = new Date(0).toISOString();
      await dispatchPendingDeliveries(fake.admin as never, 'ws-1');
    }

    const delivery = [...fake.deliveries.values()][0];
    expect(delivery.status).toBe('failed');
    expect(delivery.attempt).toBe(PUSH_MAX_ATTEMPTS);
  });

  it('uma falha num dispositivo não impede o envio para os demais', async () => {
    const webpush = (await import('web-push')).default;
    vi.mocked(webpush.sendNotification)
      .mockRejectedValueOnce(Object.assign(new Error('fail'), { statusCode: 410 }) as never)
      .mockResolvedValueOnce(undefined as never);

    const { createDeliveriesForWorkspace, dispatchPendingDeliveries } = await import('@/platform/push/push-dispatch');
    const fake = makeFakeAdmin();
    makeSubscription(fake, { task_reminders_enabled: true });
    makeSubscription(fake, { task_reminders_enabled: true });
    await createDeliveriesForWorkspace(fake.admin as never, {
      workspaceId: 'ws-1',
      category: 'task_reminder',
      dedupKey: 'task_reminder:r1',
      targetUrl: '/entrada?item=i1',
    });

    const result = await dispatchPendingDeliveries(fake.admin as never, 'ws-1');
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('restringe a entrega ao workspace informado (isolamento entre workspaces)', async () => {
    const webpush = (await import('web-push')).default;
    vi.mocked(webpush.sendNotification).mockResolvedValue(undefined as never);

    const { createDeliveriesForWorkspace, dispatchPendingDeliveries } = await import('@/platform/push/push-dispatch');
    const fake = makeFakeAdmin();
    makeSubscription(fake, { task_reminders_enabled: true, workspace_id: 'ws-1' });
    makeSubscription(fake, { task_reminders_enabled: true, workspace_id: 'ws-2' });
    await createDeliveriesForWorkspace(fake.admin as never, {
      workspaceId: 'ws-1',
      category: 'task_reminder',
      dedupKey: 'task_reminder:r1',
      targetUrl: '/entrada?item=i1',
    });
    await createDeliveriesForWorkspace(fake.admin as never, {
      workspaceId: 'ws-2',
      category: 'task_reminder',
      dedupKey: 'task_reminder:r2',
      targetUrl: '/entrada?item=i2',
    });

    const result = await dispatchPendingDeliveries(fake.admin as never, 'ws-1');
    expect(result.sent).toBe(1);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  });
});

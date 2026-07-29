// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/platform/supabase/session', () => ({ getSessionContext: vi.fn() }));
vi.mock('@/platform/supabase/admin-client', () => ({ getSupabaseAdminClient: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }));

process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'pub';
process.env.VAPID_PRIVATE_KEY = 'priv';
process.env.VAPID_SUBJECT = 'mailto:x@example.com';

type Row = Record<string, unknown>;

const OWNER = { id: 'user-1' };
const OTHER_USER = { id: 'user-2' };
const WORKSPACE = 'ws-1';

function filterChain(getRows: () => Row[]) {
  const filters: Array<(r: Row) => boolean> = [];
  const apply = () => getRows().filter((r) => filters.every((f) => f(r)));
  const chain = {
    eq(col: string, val: unknown) {
      filters.push((r) => r[col] === val);
      return chain;
    },
    is(col: string, val: null) {
      filters.push((r) => r[col] === val);
      return chain;
    },
    order() {
      return chain;
    },
    async maybeSingle() {
      const rows = apply();
      return { data: rows[0] ?? null, error: null };
    },
    async single() {
      const rows = apply();
      return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } };
    },
    then(resolve: (v: { data: Row[]; error: null }) => void) {
      resolve({ data: apply(), error: null });
    },
  };
  return chain;
}

function makeFakeAdmin(subscriptions: Row[]) {
  const rows = new Map(subscriptions.map((s) => [s.id as string, { ...s }]));
  const admin = {
    from(table: string) {
      if (table === 'push_deliveries') {
        // disableSubscription() também cancela entregas pendentes; não há
        // nenhuma neste conjunto de testes de rota — só precisa não quebrar.
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({ then: (resolve: (v: { error: null }) => void) => resolve({ error: null }) }),
              then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
            }),
          }),
        };
      }
      if (table !== 'push_subscriptions') throw new Error(`tabela inesperada: ${table}`);
      return {
        select: () => filterChain(() => [...rows.values()]),
        upsert: (row: Row) => ({
          select: () => ({
            async single() {
              const existing = [...rows.values()].find((r) => r.endpoint === row.endpoint);
              const id = (existing?.id as string) ?? `sub-${rows.size + 1}`;
              rows.set(id, { ...(existing ?? {}), ...row, id });
              return { data: { id }, error: null };
            },
          }),
        }),
        update: (patch: Row) => {
          const filters: Array<(r: Row) => boolean> = [];
          const chain2 = {
            eq(col: string, val: unknown) {
              filters.push((r) => r[col] === val);
              return chain2;
            },
            select: () => ({
              async single() {
                const target = [...rows.values()].find((r) => filters.every((f) => f(r)));
                if (!target) return { data: null, error: { message: 'not found' } };
                Object.assign(target, patch);
                return { data: target, error: null };
              },
            }),
            then(resolve: (v: { error: null }) => void) {
              for (const r of rows.values()) if (filters.every((f) => f(r))) Object.assign(r, patch);
              resolve({ error: null });
            },
          };
          return chain2;
        },
      };
    },
  };
  return { admin, rows };
}

function baseSubscription(overrides: Row = {}): Row {
  return {
    id: 'sub-1',
    workspace_id: WORKSPACE,
    user_id: OWNER.id,
    endpoint: 'https://push.example/sub-1',
    p256dh: 'p256dh-secret',
    auth_key: 'auth-secret',
    device_name: 'iPhone de Lucas',
    platform: 'ios',
    is_active: true,
    disabled_at: null,
    task_reminders_enabled: false,
    daily_planning_enabled: false,
    daily_planning_time: '08:00',
    weekly_review_enabled: false,
    weekly_review_day: 1,
    weekly_review_time: '09:00',
    capture_failure_enabled: false,
    show_details_enabled: false,
    timezone: 'America/Sao_Paulo',
    last_seen_at: null,
    created_at: '2026-07-29T10:00:00.000Z',
    ...overrides,
  };
}

async function mockSession(user: { id: string } = OWNER) {
  const { getSessionContext } = await import('@/platform/supabase/session');
  vi.mocked(getSessionContext).mockResolvedValue({
    supabase: {} as never,
    user: user as never,
    workspaceId: WORKSPACE,
  });
}

async function mockAdmin(admin: unknown) {
  const { getSupabaseAdminClient } = await import('@/platform/supabase/admin-client');
  vi.mocked(getSupabaseAdminClient).mockReturnValue(admin as never);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('POST /api/push/subscribe', () => {
  it('rejeita sem sessão (401)', async () => {
    const { getSessionContext } = await import('@/platform/supabase/session');
    vi.mocked(getSessionContext).mockResolvedValue(null);
    const { POST } = await import('@/app/api/push/subscribe/route');
    const res = await POST(
      new Request('http://x', { method: 'POST', body: JSON.stringify({}) })
    );
    expect(res.status).toBe(401);
  });

  it('rejeita endpoint HTTP (não https)', async () => {
    await mockSession();
    await mockAdmin(makeFakeAdmin([]).admin);
    const { POST } = await import('@/app/api/push/subscribe/route');
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({
          subscription: { endpoint: 'http://push.example/x', keys: { p256dh: 'a', auth: 'b' } },
        }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejeita endpoint localhost', async () => {
    await mockSession();
    await mockAdmin(makeFakeAdmin([]).admin);
    const { POST } = await import('@/app/api/push/subscribe/route');
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({
          subscription: { endpoint: 'https://localhost/x', keys: { p256dh: 'a', auth: 'b' } },
        }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejeita corpo inválido (sem keys)', async () => {
    await mockSession();
    await mockAdmin(makeFakeAdmin([]).admin);
    const { POST } = await import('@/app/api/push/subscribe/route');
    const res = await POST(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ subscription: { endpoint: 'https://push.example/x' } }) })
    );
    expect(res.status).toBe(400);
  });

  it('aceita uma assinatura válida e retorna só o subscriptionId (nunca as chaves)', async () => {
    await mockSession();
    const fake = makeFakeAdmin([]);
    await mockAdmin(fake.admin);
    const { POST } = await import('@/app/api/push/subscribe/route');
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({
          subscription: { endpoint: 'https://push.example/new', keys: { p256dh: 'a', auth: 'b' } },
          deviceName: 'Meu celular',
          platform: 'android',
          timezone: 'America/Sao_Paulo',
        }),
      })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ subscriptionId: expect.any(String) });
    expect(body.p256dh).toBeUndefined();
    expect(body.endpoint).toBeUndefined();
  });
});

describe('GET/PUT /api/push/preferences', () => {
  it('rejeita sem sessão', async () => {
    const { getSessionContext } = await import('@/platform/supabase/session');
    vi.mocked(getSessionContext).mockResolvedValue(null);
    const { GET } = await import('@/app/api/push/preferences/route');
    const res = await GET(new Request('http://x/api/push/preferences?id=sub-1'));
    expect(res.status).toBe(401);
  });

  it('nunca retorna endpoint/p256dh/auth nas preferências', async () => {
    await mockSession();
    const fake = makeFakeAdmin([baseSubscription({ id: '11111111-1111-4111-8111-111111111111' })]);
    await mockAdmin(fake.admin);
    const { GET } = await import('@/app/api/push/preferences/route');
    const res = await GET(new Request('http://x/api/push/preferences?id=11111111-1111-4111-8111-111111111111'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.endpoint).toBeUndefined();
    expect(body.p256dh).toBeUndefined();
    expect(body.auth).toBeUndefined();
    expect(body.deviceName).toBe('iPhone de Lucas');
  });

  it('outro usuário não consegue ler as preferências de uma assinatura que não é sua (404)', async () => {
    await mockSession(OTHER_USER);
    const fake = makeFakeAdmin([baseSubscription({ id: '11111111-1111-4111-8111-111111111111' })]); // pertence a OWNER
    await mockAdmin(fake.admin);
    const { GET } = await import('@/app/api/push/preferences/route');
    const res = await GET(new Request('http://x/api/push/preferences?id=11111111-1111-4111-8111-111111111111'));
    expect(res.status).toBe(404);
  });

  it('rejeita id que não é um uuid', async () => {
    await mockSession();
    await mockAdmin(makeFakeAdmin([]).admin);
    const { GET } = await import('@/app/api/push/preferences/route');
    const res = await GET(new Request('http://x/api/push/preferences?id=not-a-uuid'));
    expect(res.status).toBe(400);
  });

  it('PUT salva preferências parciais e retorna o estado atualizado', async () => {
    await mockSession();
    const fake = makeFakeAdmin([baseSubscription({ id: '11111111-1111-4111-8111-111111111111' })]);
    await mockAdmin(fake.admin);
    const { PUT } = await import('@/app/api/push/preferences/route');
    const res = await PUT(
      new Request('http://x/api/push/preferences?id=11111111-1111-4111-8111-111111111111', {
        method: 'PUT',
        body: JSON.stringify({ taskRemindersEnabled: true, dailyPlanningTime: '07:30' }),
      })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.taskRemindersEnabled).toBe(true);
    expect(body.dailyPlanningTime).toBe('07:30');
  });

  it('outro usuário não consegue alterar preferências de uma assinatura que não é sua', async () => {
    await mockSession(OTHER_USER);
    const fake = makeFakeAdmin([baseSubscription({ id: '11111111-1111-4111-8111-111111111111' })]);
    await mockAdmin(fake.admin);
    const { PUT } = await import('@/app/api/push/preferences/route');
    const res = await PUT(
      new Request('http://x/api/push/preferences?id=11111111-1111-4111-8111-111111111111', {
        method: 'PUT',
        body: JSON.stringify({ taskRemindersEnabled: true }),
      })
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /api/push/unsubscribe', () => {
  it('rejeita sem sessão', async () => {
    const { getSessionContext } = await import('@/platform/supabase/session');
    vi.mocked(getSessionContext).mockResolvedValue(null);
    const { POST } = await import('@/app/api/push/unsubscribe/route');
    const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ id: 'sub-1' }) }));
    expect(res.status).toBe(401);
  });

  it('desativa a assinatura do dispositivo atual', async () => {
    await mockSession();
    const fake = makeFakeAdmin([baseSubscription({ id: '11111111-1111-4111-8111-111111111111' })]);
    await mockAdmin(fake.admin);
    const { POST } = await import('@/app/api/push/unsubscribe/route');
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({ id: '11111111-1111-4111-8111-111111111111' }),
      })
    );
    expect(res.status).toBe(200);
    expect(fake.rows.get('11111111-1111-4111-8111-111111111111')?.is_active).toBe(false);
    expect(fake.rows.get('11111111-1111-4111-8111-111111111111')?.disabled_at).toBeTruthy();
  });

  it('não permite desativar a assinatura de outro usuário', async () => {
    await mockSession(OTHER_USER);
    const fake = makeFakeAdmin([baseSubscription({ id: '11111111-1111-4111-8111-111111111111' })]);
    await mockAdmin(fake.admin);
    const { POST } = await import('@/app/api/push/unsubscribe/route');
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({ id: '11111111-1111-4111-8111-111111111111' }),
      })
    );
    expect(res.status).toBe(404);
    expect(fake.rows.get('11111111-1111-4111-8111-111111111111')?.is_active).toBe(true);
  });
});

describe('GET /api/push/devices', () => {
  it('rejeita sem sessão', async () => {
    const { getSessionContext } = await import('@/platform/supabase/session');
    vi.mocked(getSessionContext).mockResolvedValue(null);
    const { GET } = await import('@/app/api/push/devices/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('lista sanitizada — nunca endpoint, p256dh ou auth', async () => {
    await mockSession();
    const fake = makeFakeAdmin([baseSubscription(), baseSubscription({ id: 'sub-2', user_id: OTHER_USER.id })]);
    await mockAdmin(fake.admin);
    const { GET } = await import('@/app/api/push/devices/route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.devices).toHaveLength(1); // só do usuário autenticado
    const serialized = JSON.stringify(body.devices);
    expect(serialized).not.toContain('p256dh-secret');
    expect(serialized).not.toContain('auth-secret');
    expect(serialized).not.toContain('push.example');
  });
});

describe('POST /api/push/devices/[id]/revoke', () => {
  it('revoga um dispositivo do próprio usuário', async () => {
    await mockSession();
    const fake = makeFakeAdmin([baseSubscription({ id: '11111111-1111-4111-8111-111111111111' })]);
    await mockAdmin(fake.admin);
    const { POST } = await import('@/app/api/push/devices/[id]/revoke/route');
    const res = await POST(new Request('http://x', { method: 'POST' }), {
      params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }),
    });
    expect(res.status).toBe(200);
    expect(fake.rows.get('11111111-1111-4111-8111-111111111111')?.is_active).toBe(false);
  });

  it('não permite revogar a assinatura de outro usuário (404)', async () => {
    await mockSession(OTHER_USER);
    const fake = makeFakeAdmin([baseSubscription({ id: '11111111-1111-4111-8111-111111111111' })]);
    await mockAdmin(fake.admin);
    const { POST } = await import('@/app/api/push/devices/[id]/revoke/route');
    const res = await POST(new Request('http://x', { method: 'POST' }), {
      params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }),
    });
    expect(res.status).toBe(404);
    expect(fake.rows.get('11111111-1111-4111-8111-111111111111')?.is_active).toBe(true);
  });
});

describe('POST /api/push/test', () => {
  it('rejeita sem sessão', async () => {
    const { getSessionContext } = await import('@/platform/supabase/session');
    vi.mocked(getSessionContext).mockResolvedValue(null);
    const { POST } = await import('@/app/api/push/test/route');
    const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ id: 'sub-1' }) }));
    expect(res.status).toBe(401);
  });

  it('envia teste só ao dispositivo informado (não a outros do workspace)', async () => {
    await mockSession();
    const webpush = (await import('web-push')).default;
    vi.mocked(webpush.sendNotification).mockResolvedValueOnce(undefined as never);
    const fake = makeFakeAdmin([
      baseSubscription({ id: '11111111-1111-4111-8111-111111111111' }),
      baseSubscription({ id: '22222222-2222-4222-8222-222222222222', endpoint: 'https://push.example/other' }),
    ]);
    await mockAdmin(fake.admin);
    const { POST } = await import('@/app/api/push/test/route');
    const res = await POST(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ id: '11111111-1111-4111-8111-111111111111' }) })
    );
    expect(res.status).toBe(200);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    const [sentSub] = vi.mocked(webpush.sendNotification).mock.calls[0];
    expect((sentSub as { endpoint: string }).endpoint).toBe('https://push.example/sub-1');
  });

  it('protege contra disparos repetidos (rate limit)', async () => {
    await mockSession();
    const webpush = (await import('web-push')).default;
    vi.mocked(webpush.sendNotification).mockResolvedValue(undefined as never);
    const fake = makeFakeAdmin([baseSubscription({ id: '11111111-1111-4111-8111-111111111111' })]);
    await mockAdmin(fake.admin);
    const { POST } = await import('@/app/api/push/test/route');

    const body = JSON.stringify({ id: '11111111-1111-4111-8111-111111111111' });
    await POST(new Request('http://x', { method: 'POST', body }));
    await POST(new Request('http://x', { method: 'POST', body }));
    await POST(new Request('http://x', { method: 'POST', body }));
    const fourth = await POST(new Request('http://x', { method: 'POST', body }));

    expect(fourth.status).toBe(429);
  });

  it('não permite testar a assinatura de outro usuário', async () => {
    await mockSession(OTHER_USER);
    const fake = makeFakeAdmin([baseSubscription({ id: '11111111-1111-4111-8111-111111111111' })]);
    await mockAdmin(fake.admin);
    const { POST } = await import('@/app/api/push/test/route');
    const res = await POST(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ id: '11111111-1111-4111-8111-111111111111' }) })
    );
    expect(res.status).toBe(404);
  });
});

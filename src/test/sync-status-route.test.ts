import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Testes de GET /api/debug/sync-status — sem chamadas reais ao Supabase.
 * O cliente de servidor é totalmente mockado (@/platform/supabase/server-client),
 * cobrindo os passos separadamente: usuário, membership, workspace, contagem.
 */

vi.mock('@/platform/supabase/server-client', () => ({
  getSupabaseServerClient: vi.fn(),
}));

type Chainable = {
  select: (...args: unknown[]) => Chainable;
  eq: (...args: unknown[]) => Chainable;
  order: (...args: unknown[]) => Chainable;
  limit: (...args: unknown[]) => Chainable;
  is: (...args: unknown[]) => Chainable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: (
    resolve: (v: { data: unknown; error: unknown; count: number | null }) => void,
    reject?: (e: unknown) => void
  ) => Promise<unknown>;
};

function chainable(result: { data?: unknown; error?: unknown; count?: number | null }): Chainable {
  const obj = {} as Chainable;
  for (const m of ['select', 'eq', 'order', 'limit', 'is'] as const) {
    obj[m] = () => obj;
  }
  obj.maybeSingle = async () => ({ data: result.data ?? null, error: result.error ?? null });
  obj.then = (resolve, reject) =>
    Promise.resolve({
      data: result.data ?? null,
      error: result.error ?? null,
      count: result.count ?? null,
    }).then(resolve, reject);
  return obj;
}

function createFakeSupabase(opts: {
  user?: { id: string } | null;
  userError?: unknown;
  membership?: { workspace_id: string } | null;
  membershipError?: unknown;
  projectsCount?: number | null;
  projectsError?: unknown;
}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.user ?? null }, error: opts.userError ?? null }),
    },
    from: (table: string) => {
      if (table === 'workspace_members') {
        return chainable({ data: opts.membership ?? null, error: opts.membershipError ?? null });
      }
      if (table === 'projects') {
        return chainable({ count: opts.projectsCount ?? null, error: opts.projectsError ?? null });
      }
      throw new Error(`tabela inesperada no mock: ${table}`);
    },
  };
}

const FORBIDDEN_KEYS = ['jwt', 'cookie', 'token', 'email', 'accessToken', 'refreshToken', 'headers', 'connectionString'];

beforeEach(() => {
  vi.resetModules();
});

describe('GET /api/debug/sync-status', () => {
  it('rejeita usuário não autenticado com 401 (servidor sem sessão)', async () => {
    const { getSupabaseServerClient } = await import('@/platform/supabase/server-client');
    vi.mocked(getSupabaseServerClient).mockResolvedValue(
      createFakeSupabase({ user: null }) as never
    );

    const { GET } = await import('@/app/api/debug/sync-status/route');
    const res = await GET();

    expect(res.status).toBe(401);
  });

  it('servidor autenticado com consulta bem-sucedida retorna a contagem real', async () => {
    const { getSupabaseServerClient } = await import('@/platform/supabase/server-client');
    vi.mocked(getSupabaseServerClient).mockResolvedValue(
      createFakeSupabase({
        user: { id: 'user-1' },
        membership: { workspace_id: 'ws-1' },
        projectsCount: 7,
      }) as never
    );

    const { GET } = await import('@/app/api/debug/sync-status/route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      serverAuthenticated: true,
      serverUserResolved: true,
      serverWorkspaceResolved: true,
      serverMembershipFound: true,
      serverProjectsQueryExecuted: true,
      serverProjectsQueryStatus: 'success',
      serverProjectCount: 7,
      serverErrorCategory: 'none',
    });
  });

  it('classifica permission denied sem vazar a mensagem bruta do Postgres', async () => {
    const { getSupabaseServerClient } = await import('@/platform/supabase/server-client');
    vi.mocked(getSupabaseServerClient).mockResolvedValue(
      createFakeSupabase({
        user: { id: 'user-1' },
        membership: { workspace_id: 'ws-1' },
        projectsError: { code: '42501', message: 'permission denied for table projects' },
      }) as never
    );

    const { GET } = await import('@/app/api/debug/sync-status/route');
    const res = await GET();
    const body = await res.json();

    expect(body.serverErrorCategory).toBe('permission_denied');
    expect(body.serverProjectsQueryStatus).toBe('error');
    expect(JSON.stringify(body)).not.toContain('permission denied for table projects');
  });

  it('não retorna e-mail, JWT, cookies, tokens, UUID completo ou respostas internas do Supabase', async () => {
    const { getSupabaseServerClient } = await import('@/platform/supabase/server-client');
    vi.mocked(getSupabaseServerClient).mockResolvedValue(
      createFakeSupabase({
        user: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
        membership: { workspace_id: 'ffffffff-1111-2222-3333-444444444444' },
        projectsCount: 3,
      }) as never
    );

    const { GET } = await import('@/app/api/debug/sync-status/route');
    const res = await GET();
    const body = await res.json();
    const raw = JSON.stringify(body).toLowerCase();

    for (const key of FORBIDDEN_KEYS) {
      expect(raw).not.toContain(key.toLowerCase());
    }
    // nenhum UUID completo (36 caracteres com hifens) deve aparecer no corpo.
    expect(raw).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });
});

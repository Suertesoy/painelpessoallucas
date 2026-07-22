import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Testes do Bloco B (navegador) do diagnóstico de sincronização — sem
 * chamadas reais ao Supabase. O cliente do navegador é mockado
 * (@/platform/supabase/browser-client); fetch() global é mockado para o
 * Bloco A visto do lado do cliente.
 */

vi.mock('@/platform/supabase/browser-client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}));

function makeFakeBrowserClient(opts: {
  session?: object | null;
  user?: object | null;
  projectsCount?: number | null;
  projectsError?: unknown;
}) {
  return {
    auth: {
      getSession: async () => ({ data: { session: opts.session ?? null } }),
      getUser: async () => ({ data: { user: opts.user ?? null } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          is: async () => ({
            count: opts.projectsCount ?? null,
            error: opts.projectsError ?? null,
          }),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('categorizePostgrestError', () => {
  it('classifica 42501 como permission_denied', async () => {
    const { categorizePostgrestError } = await import('@/components/sync-diagnostics-card');
    expect(categorizePostgrestError({ code: '42501' })).toBe('permission_denied');
  });

  it('classifica outros códigos como query_error genérico', async () => {
    const { categorizePostgrestError } = await import('@/components/sync-diagnostics-card');
    expect(categorizePostgrestError({ code: '23505' })).toBe('query_error');
  });
});

describe('fetchBrowserStatus', () => {
  it('navegador sem sessão: nenhum estado é resolvido e a consulta não roda', async () => {
    const { getSupabaseBrowserClient } = await import('@/platform/supabase/browser-client');
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(
      makeFakeBrowserClient({ session: null, user: null }) as never
    );

    const { fetchBrowserStatus } = await import('@/components/sync-diagnostics-card');
    const status = await fetchBrowserStatus(null);

    expect(status.browserSessionResolved).toBe(false);
    expect(status.browserUserResolved).toBe(false);
    expect(status.browserWorkspaceResolved).toBe(false);
    expect(status.browserProjectsQueryExecuted).toBe(false);
  });

  it('navegador autenticado com consulta bem-sucedida retorna a contagem', async () => {
    const { getSupabaseBrowserClient } = await import('@/platform/supabase/browser-client');
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(
      makeFakeBrowserClient({ session: {}, user: {}, projectsCount: 7 }) as never
    );

    const { fetchBrowserStatus } = await import('@/components/sync-diagnostics-card');
    const status = await fetchBrowserStatus('ws-1');

    expect(status.browserSessionResolved).toBe(true);
    expect(status.browserUserResolved).toBe(true);
    expect(status.browserWorkspaceResolved).toBe(true);
    expect(status.browserProjectsQueryStatus).toBe('success');
    expect(status.browserProjectCount).toBe(7);
    expect(status.browserErrorCategory).toBe('none');
  });

  it('o mesmo usuário/workspace recebe a mesma contagem em duas instâncias mockadas', async () => {
    const { getSupabaseBrowserClient } = await import('@/platform/supabase/browser-client');
    const { fetchBrowserStatus } = await import('@/components/sync-diagnostics-card');

    // Instância "desktop"
    vi.mocked(getSupabaseBrowserClient).mockReturnValueOnce(
      makeFakeBrowserClient({ session: {}, user: {}, projectsCount: 7 }) as never
    );
    const desktop = await fetchBrowserStatus('ws-1');

    // Instância "celular" — cliente independente, mesma identidade/workspace
    vi.mocked(getSupabaseBrowserClient).mockReturnValueOnce(
      makeFakeBrowserClient({ session: {}, user: {}, projectsCount: 7 }) as never
    );
    const mobile = await fetchBrowserStatus('ws-1');

    expect(mobile.browserProjectCount).toBe(desktop.browserProjectCount);
    expect(mobile.browserProjectsQueryStatus).toBe(desktop.browserProjectsQueryStatus);
  });

  it('classifica permission denied na consulta do navegador sem vazar a mensagem bruta', async () => {
    const { getSupabaseBrowserClient } = await import('@/platform/supabase/browser-client');
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(
      makeFakeBrowserClient({
        session: {},
        user: {},
        projectsError: { code: '42501', message: 'permission denied for table projects' },
      }) as never
    );

    const { fetchBrowserStatus } = await import('@/components/sync-diagnostics-card');
    const status = await fetchBrowserStatus('ws-1');

    expect(status.browserErrorCategory).toBe('permission_denied');
    expect(JSON.stringify(status)).not.toContain('permission denied for table projects');
  });
});

describe('fetchServerStatus (visão do cliente sobre o Bloco A)', () => {
  it('mapeia HTTP 401 para o estado "sem sessão no servidor"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) })
    );

    const { fetchServerStatus } = await import('@/components/sync-diagnostics-card');
    const status = await fetchServerStatus();

    expect(status.serverAuthenticated).toBe(false);
    expect(status.serverErrorCategory).toBe('unauthenticated');
  });

  it('repassa o corpo da rota quando a resposta é 200', async () => {
    const body = {
      serverAuthenticated: true,
      serverUserResolved: true,
      serverWorkspaceResolved: true,
      serverMembershipFound: true,
      serverProjectsQueryExecuted: true,
      serverProjectsQueryStatus: 'success',
      serverProjectCount: 7,
      serverErrorCategory: 'none',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => body })
    );

    const { fetchServerStatus } = await import('@/components/sync-diagnostics-card');
    const status = await fetchServerStatus();

    expect(status).toEqual(body);
  });
});

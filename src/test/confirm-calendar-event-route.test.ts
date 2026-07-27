// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sha256Hex } from '@/lib/text-hash';

/**
 * POST /api/audio/confirm-calendar-event — sem chamadas reais ao Google.
 * Reaproveita a integração existente (mockada aqui) e nunca cria o evento
 * sem confirmação explícita (só é chamada quando o usuário clica "Criar
 * evento"). Cobre: Calendar desconectado, falha ao criar (captura/tarefa
 * intactas, calendar_event_links nunca escrito), sucesso, e — a regra nova —
 * rejeição quando a transcrição analisada (ai_runs.input_hash) não
 * corresponde mais ao conteúdo atual da captura (proposta desatualizada).
 */

vi.mock('@/platform/supabase/session', () => ({ getSessionContext: vi.fn() }));
vi.mock('@/platform/supabase/admin-client', () => ({ getSupabaseAdminClient: vi.fn() }));
vi.mock('@/platform/integrations/calendar-sync', () => ({ getCalendarAccount: vi.fn() }));
vi.mock('@/platform/integrations/google-client', () => ({
  getValidAccessToken: vi.fn(),
  GoogleTokenRevokedError: class GoogleTokenRevokedError extends Error {},
}));
vi.mock('@/platform/integrations/google-calendar', () => ({
  ensureAppCalendar: vi.fn(),
  upsertItemEvent: vi.fn(),
}));

const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const AI_RUN_ID = '99999999-9999-4999-8999-999999999999';

/** Fake do `session.supabase`: 'items' (busca por id) e 'ai_runs' (checkTriageFreshness). */
function fakeSupabase(opts: { item: Record<string, unknown> | null; aiRun?: Record<string, unknown> | null }) {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is']) chain[m] = () => chain;
      if (table === 'items') {
        chain.maybeSingle = async () => ({ data: opts.item, error: null });
      } else if (table === 'ai_runs') {
        chain.maybeSingle = async () => ({ data: opts.aiRun ?? null, error: null });
      } else {
        throw new Error(`tabela inesperada no mock: ${table}`);
      }
      return chain;
    },
  };
}

async function freshAiRun(content: string) {
  return { id: AI_RUN_ID, item_id: ITEM_ID, status: 'completed', input_hash: await sha256Hex(content) };
}

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    itemId: ITEM_ID,
    aiRunId: AI_RUN_ID,
    title: 'Reunião com a Priscila',
    startAt: '2026-07-25T10:00:00-03:00',
    endAt: '2026-07-25T11:00:00-03:00',
    ...overrides,
  };
}

function jsonRequest(body: unknown): Request {
  return new Request('http://x/api/audio/confirm-calendar-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('POST /api/audio/confirm-calendar-event', () => {
  it('rejeita sem sessão (401)', async () => {
    const { getSessionContext } = await import('@/platform/supabase/session');
    vi.mocked(getSessionContext).mockResolvedValue(null);

    const { POST } = await import('@/app/api/audio/confirm-calendar-event/route');
    const res = await POST(jsonRequest(baseBody()));
    expect(res.status).toBe(401);
  });

  it('rejeita corpo com data/horário incompletos', async () => {
    const { getSessionContext } = await import('@/platform/supabase/session');
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({ item: { id: 'item-1' } }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });

    const { POST } = await import('@/app/api/audio/confirm-calendar-event/route');
    const res = await POST(jsonRequest({ itemId: 'x', title: 'Reunião' }));
    expect(res.status).toBe(400);
  });

  it('captura não encontrada sob RLS (404)', async () => {
    const { getSessionContext } = await import('@/platform/supabase/session');
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({ item: null }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });

    const { POST } = await import('@/app/api/audio/confirm-calendar-event/route');
    const res = await POST(jsonRequest(baseBody()));
    expect(res.status).toBe(404);
  });

  it('proposta desatualizada: transcrição mudou depois da análise — 409, nenhuma chamada ao Google', async () => {
    const { getSessionContext } = await import('@/platform/supabase/session');
    const { getValidAccessToken } = await import('@/platform/integrations/google-client');
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({
        item: { id: ITEM_ID, content: 'texto editado depois da análise', title: null },
        aiRun: await freshAiRun('texto ORIGINAL analisado'),
      }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });

    const { POST } = await import('@/app/api/audio/confirm-calendar-event/route');
    const res = await POST(jsonRequest(baseBody()));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.errorCategory).toBe('stale_analysis');
    expect(body.error).toContain('Analise novamente');
    expect(getValidAccessToken).not.toHaveBeenCalled();
  });

  it('Calendar desconectado: 409, nenhuma chamada ao Google, item nunca tocado', async () => {
    const { getSessionContext } = await import('@/platform/supabase/session');
    const { getCalendarAccount } = await import('@/platform/integrations/calendar-sync');
    const { getValidAccessToken } = await import('@/platform/integrations/google-client');
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({
        item: { id: ITEM_ID, content: 'transcrição atual', title: null },
        aiRun: await freshAiRun('transcrição atual'),
      }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });
    vi.mocked(getCalendarAccount).mockResolvedValue(null);

    const { POST } = await import('@/app/api/audio/confirm-calendar-event/route');
    const res = await POST(jsonRequest(baseBody()));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.errorCategory).toBe('calendar_not_connected');
    expect(getValidAccessToken).not.toHaveBeenCalled();
  });

  it('falha ao criar o evento: resposta de erro, calendar_event_links NUNCA é escrito', async () => {
    const { getSessionContext } = await import('@/platform/supabase/session');
    const { getSupabaseAdminClient } = await import('@/platform/supabase/admin-client');
    const { getCalendarAccount } = await import('@/platform/integrations/calendar-sync');
    const { getValidAccessToken } = await import('@/platform/integrations/google-client');
    const { ensureAppCalendar, upsertItemEvent } = await import('@/platform/integrations/google-calendar');

    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({
        item: { id: ITEM_ID, content: 'transcrição atual', title: null },
        aiRun: await freshAiRun('transcrição atual'),
      }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });
    vi.mocked(getCalendarAccount).mockResolvedValue({ id: 'account-1' } as never);
    const upsertCalendarLink = vi.fn();
    vi.mocked(getSupabaseAdminClient).mockReturnValue({
      from: () => ({ upsert: (v: unknown) => (upsertCalendarLink(v), { eq: async () => ({ error: null }) }) }),
    } as never);
    vi.mocked(getValidAccessToken).mockResolvedValue('access-token');
    vi.mocked(ensureAppCalendar).mockResolvedValue('cal-1');
    vi.mocked(upsertItemEvent).mockRejectedValue(new Error('HTTP 500'));

    const { POST } = await import('@/app/api/audio/confirm-calendar-event/route');
    const res = await POST(jsonRequest(baseBody()));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.errorCategory).toBe('calendar_error');
    expect(upsertCalendarLink).not.toHaveBeenCalled();
  });

  it('token do Google revogado: 409 calendar_not_connected, sem apagar nada', async () => {
    const { getSessionContext } = await import('@/platform/supabase/session');
    const { getCalendarAccount } = await import('@/platform/integrations/calendar-sync');
    const { getValidAccessToken, GoogleTokenRevokedError } = await import('@/platform/integrations/google-client');

    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({
        item: { id: ITEM_ID, content: 'transcrição atual', title: null },
        aiRun: await freshAiRun('transcrição atual'),
      }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });
    vi.mocked(getCalendarAccount).mockResolvedValue({ id: 'account-1' } as never);
    vi.mocked(getValidAccessToken).mockRejectedValue(new GoogleTokenRevokedError());

    const { POST } = await import('@/app/api/audio/confirm-calendar-event/route');
    const res = await POST(jsonRequest(baseBody()));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.errorCategory).toBe('calendar_not_connected');
  });

  it('cria o evento só após confirmação explícita e vincula à captura (sucesso)', async () => {
    const { getSessionContext } = await import('@/platform/supabase/session');
    const { getSupabaseAdminClient } = await import('@/platform/supabase/admin-client');
    const { getCalendarAccount } = await import('@/platform/integrations/calendar-sync');
    const { getValidAccessToken } = await import('@/platform/integrations/google-client');
    const { ensureAppCalendar, upsertItemEvent } = await import('@/platform/integrations/google-calendar');

    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({
        item: { id: ITEM_ID, content: 'transcrição atual', title: null },
        aiRun: await freshAiRun('transcrição atual'),
      }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });
    vi.mocked(getCalendarAccount).mockResolvedValue({ id: 'account-1' } as never);
    const upsertedLinks: unknown[] = [];
    vi.mocked(getSupabaseAdminClient).mockReturnValue({
      from: () => ({
        upsert: (v: unknown) => {
          upsertedLinks.push(v);
          return { eq: async () => ({ error: null }) };
        },
      }),
    } as never);
    vi.mocked(getValidAccessToken).mockResolvedValue('access-token');
    vi.mocked(ensureAppCalendar).mockResolvedValue('cal-1');
    vi.mocked(upsertItemEvent).mockResolvedValue({ id: 'event-1', etag: 'etag-1' });

    const { POST } = await import('@/app/api/audio/confirm-calendar-event/route');
    const res = await POST(jsonRequest(baseBody({ location: 'Escritório' })));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.googleEventId).toBe('event-1');
    expect(upsertedLinks).toHaveLength(1);
    expect((upsertedLinks[0] as Record<string, unknown>).item_id).toBe(ITEM_ID);
    // Participantes/convites nunca são enviados nesta versão.
    expect(vi.mocked(upsertItemEvent).mock.calls[0][2]).not.toHaveProperty('attendees');
  });
});

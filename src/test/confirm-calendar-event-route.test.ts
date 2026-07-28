// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sha256Hex } from '@/lib/text-hash';

/**
 * POST /api/audio/confirm-calendar-event — sem chamadas reais ao Google.
 * Cobre: validação de intervalo ANTES de qualquer chamada ao Google/banco,
 * sanitização de erros (nunca "HTTP 4xx/5xx" cru na resposta), modalidade/
 * local/link/lembretes, idempotência (retry vira PUT, nunca duplica o
 * evento externo) e o caso "Google criou, mas o vínculo falhou ao gravar"
 * (sucesso parcial, não é reportado como falha da criação).
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
  GoogleCalendarRequestError: class GoogleCalendarRequestError extends Error {
    status: number;
    constructor(status: number) {
      super(`Falha ao sincronizar evento (HTTP ${status})`);
      this.status = status;
    }
  },
}));

const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const AI_RUN_ID = '99999999-9999-4999-8999-999999999999';

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

function fakeAdmin(opts: {
  existingLink?: { google_calendar_id: string; google_event_id: string } | null;
  upsertError?: string | null;
}) {
  const upsertedLinks: Record<string, unknown>[] = [];
  return {
    admin: {
      from: (table: string) => {
        if (table !== 'calendar_event_links') throw new Error(`tabela inesperada no admin mock: ${table}`);
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: opts.existingLink ?? null, error: null }),
            }),
          }),
          upsert: async (v: Record<string, unknown>) => {
            upsertedLinks.push(v);
            return { error: opts.upsertError ? { message: opts.upsertError } : null };
          },
        };
      },
    },
    upsertedLinks,
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
    startAt: '2026-08-05T10:00:00-03:00',
    endAt: '2026-08-05T11:00:00-03:00',
    ...overrides,
  };
}

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://x${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function mockAuthed(item: Record<string, unknown>, aiRun: Record<string, unknown> | null) {
  const { getSessionContext } = await import('@/platform/supabase/session');
  vi.mocked(getSessionContext).mockResolvedValue({
    supabase: fakeSupabase({ item, aiRun }) as never,
    user: { id: 'u1' } as never,
    workspaceId: 'ws-1',
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
    const res = await POST(jsonRequest('/api/audio/confirm-calendar-event', baseBody()));
    expect(res.status).toBe(401);
  });

  it('rejeita corpo com data/horário incompletos', async () => {
    await mockAuthed({ id: 'item-1' }, null);
    const { POST } = await import('@/app/api/audio/confirm-calendar-event/route');
    const res = await POST(jsonRequest('/api/audio/confirm-calendar-event', { itemId: 'x', title: 'Reunião' }));
    expect(res.status).toBe(400);
  });

  it('término anterior ao início: 400 com a mensagem exigida, sem tocar Calendar/banco/Google', async () => {
    const { getCalendarAccount } = await import('@/platform/integrations/calendar-sync');
    await mockAuthed({ id: ITEM_ID, content: 'x', title: null }, await freshAiRun('x'));

    const { POST } = await import('@/app/api/audio/confirm-calendar-event/route');
    const res = await POST(
      jsonRequest(
        '/api/audio/confirm-calendar-event',
        baseBody({ startAt: '2026-08-05T11:00:00-03:00', endAt: '2026-08-05T10:00:00-03:00' })
      )
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.errorCategory).toBe('invalid_interval');
    expect(body.error).toBe('Não dá para terminar antes de começar.');
    expect(getCalendarAccount).not.toHaveBeenCalled();
  });

  it('término igual ao início também é inválido', async () => {
    await mockAuthed({ id: ITEM_ID, content: 'x', title: null }, await freshAiRun('x'));
    const { POST } = await import('@/app/api/audio/confirm-calendar-event/route');
    const res = await POST(
      jsonRequest('/api/audio/confirm-calendar-event', baseBody({ startAt: '2026-08-05T10:00:00-03:00', endAt: '2026-08-05T10:00:00-03:00' }))
    );
    expect(res.status).toBe(400);
    expect((await res.json()).errorCategory).toBe('invalid_interval');
  });

  it('modalidade online com link inválido é rejeitada antes de qualquer chamada ao Google', async () => {
    await mockAuthed({ id: ITEM_ID, content: 'x', title: null }, await freshAiRun('x'));
    const { getCalendarAccount } = await import('@/platform/integrations/calendar-sync');
    const { POST } = await import('@/app/api/audio/confirm-calendar-event/route');
    const res = await POST(
      jsonRequest('/api/audio/confirm-calendar-event', baseBody({ modality: 'online', meetingLink: 'http://inseguro.com' }))
    );
    expect(res.status).toBe(400);
    expect(getCalendarAccount).not.toHaveBeenCalled();
  });

  it('captura não encontrada sob RLS (404)', async () => {
    await mockAuthed(null as never, null);
    const { POST } = await import('@/app/api/audio/confirm-calendar-event/route');
    const res = await POST(jsonRequest('/api/audio/confirm-calendar-event', baseBody()));
    expect(res.status).toBe(404);
  });

  it('proposta desatualizada: transcrição mudou depois da análise — 409, nenhuma chamada ao Google', async () => {
    const { getValidAccessToken } = await import('@/platform/integrations/google-client');
    await mockAuthed(
      { id: ITEM_ID, content: 'texto editado depois da análise', title: null },
      await freshAiRun('texto ORIGINAL analisado')
    );

    const { POST } = await import('@/app/api/audio/confirm-calendar-event/route');
    const res = await POST(jsonRequest('/api/audio/confirm-calendar-event', baseBody()));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.errorCategory).toBe('stale_analysis');
    expect(getValidAccessToken).not.toHaveBeenCalled();
  });

  it('Calendar desconectado: 409, nenhuma chamada ao Google', async () => {
    const { getCalendarAccount } = await import('@/platform/integrations/calendar-sync');
    const { getValidAccessToken } = await import('@/platform/integrations/google-client');
    await mockAuthed({ id: ITEM_ID, content: 'transcrição atual', title: null }, await freshAiRun('transcrição atual'));
    vi.mocked(getCalendarAccount).mockResolvedValue(null);

    const { POST } = await import('@/app/api/audio/confirm-calendar-event/route');
    const res = await POST(jsonRequest('/api/audio/confirm-calendar-event', baseBody()));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.errorCategory).toBe('calendar_not_connected');
    expect(getValidAccessToken).not.toHaveBeenCalled();
  });

  it('token revogado: 409 calendar_not_connected, mensagem amigável', async () => {
    const { getCalendarAccount } = await import('@/platform/integrations/calendar-sync');
    const { getValidAccessToken, GoogleTokenRevokedError } = await import('@/platform/integrations/google-client');
    const { getSupabaseAdminClient } = await import('@/platform/supabase/admin-client');
    await mockAuthed({ id: ITEM_ID, content: 'transcrição atual', title: null }, await freshAiRun('transcrição atual'));
    vi.mocked(getCalendarAccount).mockResolvedValue({ id: 'account-1' } as never);
    vi.mocked(getValidAccessToken).mockRejectedValue(new GoogleTokenRevokedError());
    vi.mocked(getSupabaseAdminClient).mockReturnValue(fakeAdmin({}).admin as never);

    const { POST } = await import('@/app/api/audio/confirm-calendar-event/route');
    const res = await POST(jsonRequest('/api/audio/confirm-calendar-event', baseBody()));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.errorCategory).toBe('calendar_not_connected');
  });

  it('falha do Google (4xx/5xx): mensagem sanitizada, nenhum "HTTP" na resposta, vínculo nunca escrito', async () => {
    const { getCalendarAccount } = await import('@/platform/integrations/calendar-sync');
    const { getValidAccessToken } = await import('@/platform/integrations/google-client');
    const { getSupabaseAdminClient } = await import('@/platform/supabase/admin-client');
    const { ensureAppCalendar, upsertItemEvent, GoogleCalendarRequestError } = await import(
      '@/platform/integrations/google-calendar'
    );

    await mockAuthed({ id: ITEM_ID, content: 'transcrição atual', title: null }, await freshAiRun('transcrição atual'));
    vi.mocked(getCalendarAccount).mockResolvedValue({ id: 'account-1' } as never);
    vi.mocked(getValidAccessToken).mockResolvedValue('access-token');
    vi.mocked(ensureAppCalendar).mockResolvedValue('cal-1');
    vi.mocked(upsertItemEvent).mockRejectedValue(new GoogleCalendarRequestError(400));
    const { admin, upsertedLinks } = fakeAdmin({});
    vi.mocked(getSupabaseAdminClient).mockReturnValue(admin as never);

    const { POST } = await import('@/app/api/audio/confirm-calendar-event/route');
    const res = await POST(jsonRequest('/api/audio/confirm-calendar-event', baseBody()));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.errorCategory).toBe('calendar_error');
    expect(body.error).not.toMatch(/HTTP/i);
    expect(body.error).not.toMatch(/\b400\b/);
    expect(upsertedLinks).toHaveLength(0);
  });

  it('sucesso: cria evento presencial, envia location ao Google e persiste os campos normalizados', async () => {
    const { getCalendarAccount } = await import('@/platform/integrations/calendar-sync');
    const { getValidAccessToken } = await import('@/platform/integrations/google-client');
    const { getSupabaseAdminClient } = await import('@/platform/supabase/admin-client');
    const { ensureAppCalendar, upsertItemEvent } = await import('@/platform/integrations/google-calendar');

    await mockAuthed({ id: ITEM_ID, content: 'transcrição atual', title: null }, await freshAiRun('transcrição atual'));
    vi.mocked(getCalendarAccount).mockResolvedValue({ id: 'account-1' } as never);
    vi.mocked(getValidAccessToken).mockResolvedValue('access-token');
    vi.mocked(ensureAppCalendar).mockResolvedValue('cal-1');
    vi.mocked(upsertItemEvent).mockResolvedValue({
      id: 'event-1',
      etag: 'etag-1',
      htmlLink: 'https://calendar.google.com/event?eid=abc',
      iCalUID: 'ical-1',
      status: 'confirmed',
    });
    const { admin, upsertedLinks } = fakeAdmin({});
    vi.mocked(getSupabaseAdminClient).mockReturnValue(admin as never);

    const { POST } = await import('@/app/api/audio/confirm-calendar-event/route');
    const res = await POST(
      jsonRequest(
        '/api/audio/confirm-calendar-event',
        baseBody({
          modality: 'in_person',
          location: 'Av. Paulista, 1000 - São Paulo',
          locationPlaceId: 'place-123',
          locationLat: -23.56,
          locationLng: -46.65,
        })
      )
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('created');
    expect(body.googleEventId).toBe('event-1');
    expect(body.htmlLink).toBe('https://calendar.google.com/event?eid=abc');

    // Local vai para o campo `location` do evento no Google.
    const [, , eventInput] = vi.mocked(upsertItemEvent).mock.calls[0];
    expect(eventInput.location).toBe('Av. Paulista, 1000 - São Paulo');
    expect(eventInput.reminderMinutes).toEqual([1440, 60]);

    expect(upsertedLinks).toHaveLength(1);
    const link = upsertedLinks[0];
    expect(link.item_id).toBe(ITEM_ID);
    expect(link.modality).toBe('in_person');
    expect(link.location).toBe('Av. Paulista, 1000 - São Paulo');
    expect(link.location_place_id).toBe('place-123');
    expect(link.created_by_panel).toBe(true);
    expect(link.ical_uid).toBe('ical-1');
    // Participantes/convites nunca são enviados nesta versão.
    expect(eventInput).not.toHaveProperty('attendees');
  });

  it('retry idempotente: vínculo já existe para o item — Google recebe PUT (update), nunca cria um segundo evento', async () => {
    const { getCalendarAccount } = await import('@/platform/integrations/calendar-sync');
    const { getValidAccessToken } = await import('@/platform/integrations/google-client');
    const { getSupabaseAdminClient } = await import('@/platform/supabase/admin-client');
    const { ensureAppCalendar, upsertItemEvent } = await import('@/platform/integrations/google-calendar');

    await mockAuthed({ id: ITEM_ID, content: 'transcrição atual', title: null }, await freshAiRun('transcrição atual'));
    vi.mocked(getCalendarAccount).mockResolvedValue({ id: 'account-1' } as never);
    vi.mocked(getValidAccessToken).mockResolvedValue('access-token');
    vi.mocked(ensureAppCalendar).mockResolvedValue('cal-1');
    vi.mocked(upsertItemEvent).mockResolvedValue({ id: 'event-1', etag: 'etag-2' });
    const { admin } = fakeAdmin({ existingLink: { google_calendar_id: 'cal-1', google_event_id: 'event-1' } });
    vi.mocked(getSupabaseAdminClient).mockReturnValue(admin as never);

    const { POST } = await import('@/app/api/audio/confirm-calendar-event/route');
    await POST(jsonRequest('/api/audio/confirm-calendar-event', baseBody()));

    const [, , , existingEventId] = vi.mocked(upsertItemEvent).mock.calls[0];
    expect(existingEventId).toBe('event-1');
  });

  it('lembretes vencidos são removidos sem impedir a criação (evento em 90min: só o de 1h sobrevive)', async () => {
    const { getCalendarAccount } = await import('@/platform/integrations/calendar-sync');
    const { getValidAccessToken } = await import('@/platform/integrations/google-client');
    const { getSupabaseAdminClient } = await import('@/platform/supabase/admin-client');
    const { ensureAppCalendar, upsertItemEvent } = await import('@/platform/integrations/google-calendar');

    await mockAuthed({ id: ITEM_ID, content: 'transcrição atual', title: null }, await freshAiRun('transcrição atual'));
    vi.mocked(getCalendarAccount).mockResolvedValue({ id: 'account-1' } as never);
    vi.mocked(getValidAccessToken).mockResolvedValue('access-token');
    vi.mocked(ensureAppCalendar).mockResolvedValue('cal-1');
    vi.mocked(upsertItemEvent).mockResolvedValue({ id: 'event-1', etag: 'etag-1' });
    const { admin, upsertedLinks } = fakeAdmin({});
    vi.mocked(getSupabaseAdminClient).mockReturnValue(admin as never);

    const start = new Date(Date.now() + 90 * 60000).toISOString();
    const end = new Date(Date.now() + 150 * 60000).toISOString();

    const { POST } = await import('@/app/api/audio/confirm-calendar-event/route');
    const res = await POST(jsonRequest('/api/audio/confirm-calendar-event', baseBody({ startAt: start, endAt: end })));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reminders).toEqual([60]);
    expect(upsertedLinks[0].reminders_minutes).toEqual([60]);
  });

  it('Google criou o evento mas o vínculo falhou ao gravar: sucesso parcial, NUNCA reportado como falha da criação', async () => {
    const { getCalendarAccount } = await import('@/platform/integrations/calendar-sync');
    const { getValidAccessToken } = await import('@/platform/integrations/google-client');
    const { getSupabaseAdminClient } = await import('@/platform/supabase/admin-client');
    const { ensureAppCalendar, upsertItemEvent } = await import('@/platform/integrations/google-calendar');

    await mockAuthed({ id: ITEM_ID, content: 'transcrição atual', title: null }, await freshAiRun('transcrição atual'));
    vi.mocked(getCalendarAccount).mockResolvedValue({ id: 'account-1' } as never);
    vi.mocked(getValidAccessToken).mockResolvedValue('access-token');
    vi.mocked(ensureAppCalendar).mockResolvedValue('cal-1');
    vi.mocked(upsertItemEvent).mockResolvedValue({ id: 'event-1', etag: 'etag-1', htmlLink: 'https://x' });
    const { admin } = fakeAdmin({ upsertError: 'conexão com o banco perdida' });
    vi.mocked(getSupabaseAdminClient).mockReturnValue(admin as never);

    const { POST } = await import('@/app/api/audio/confirm-calendar-event/route');
    const res = await POST(jsonRequest('/api/audio/confirm-calendar-event', baseBody()));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('created_link_pending');
    expect(body.googleEventId).toBe('event-1');
    expect(body.message).toContain('não foi possível atualizar a agenda do painel');
    expect(body.message).not.toMatch(/conexão com o banco/);
  });
});

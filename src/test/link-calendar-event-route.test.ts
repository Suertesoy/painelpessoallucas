// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sha256Hex } from '@/lib/text-hash';

/**
 * POST /api/audio/link-calendar-event — nunca importa nem chama nada do
 * Google (só persiste o vínculo de um evento JÁ criado). Por construção,
 * repetir esta chamada não pode duplicar o evento externo: não há como,
 * já que o módulo do Google nem está no grafo de dependências desta rota.
 */

vi.mock('@/platform/supabase/session', () => ({ getSessionContext: vi.fn() }));
vi.mock('@/platform/supabase/admin-client', () => ({ getSupabaseAdminClient: vi.fn() }));

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

async function freshAiRun(content: string) {
  return { id: AI_RUN_ID, item_id: ITEM_ID, status: 'completed', input_hash: await sha256Hex(content) };
}

async function mockAuthed(item: Record<string, unknown> | null, aiRun: Record<string, unknown> | null) {
  const { getSessionContext } = await import('@/platform/supabase/session');
  vi.mocked(getSessionContext).mockResolvedValue({
    supabase: fakeSupabase({ item, aiRun }) as never,
    user: { id: 'u1' } as never,
    workspaceId: 'ws-1',
  });
}

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    itemId: ITEM_ID,
    aiRunId: AI_RUN_ID,
    googleCalendarId: 'cal-1',
    googleEventId: 'event-1',
    title: 'Reunião com a Priscila',
    startAt: '2026-08-05T10:00:00-03:00',
    endAt: '2026-08-05T11:00:00-03:00',
    timeZone: 'America/Sao_Paulo',
    modality: 'undetermined',
    ...overrides,
  };
}

function jsonRequest(body: unknown): Request {
  return new Request('http://x/api/audio/link-calendar-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('POST /api/audio/link-calendar-event', () => {
  it('rejeita sem sessão (401)', async () => {
    const { getSessionContext } = await import('@/platform/supabase/session');
    vi.mocked(getSessionContext).mockResolvedValue(null);
    const { POST } = await import('@/app/api/audio/link-calendar-event/route');
    const res = await POST(jsonRequest(baseBody()));
    expect(res.status).toBe(401);
  });

  it('rejeita corpo incompleto', async () => {
    await mockAuthed({ id: ITEM_ID }, null);
    const { POST } = await import('@/app/api/audio/link-calendar-event/route');
    const res = await POST(jsonRequest({ itemId: ITEM_ID }));
    expect(res.status).toBe(400);
  });

  it('captura não encontrada (404)', async () => {
    await mockAuthed(null, null);
    const { POST } = await import('@/app/api/audio/link-calendar-event/route');
    const res = await POST(jsonRequest(baseBody()));
    expect(res.status).toBe(404);
  });

  it('proposta desatualizada: 409, vínculo não é gravado', async () => {
    const { getSupabaseAdminClient } = await import('@/platform/supabase/admin-client');
    const upsert = vi.fn();
    vi.mocked(getSupabaseAdminClient).mockReturnValue({
      from: () => ({ upsert }),
    } as never);
    await mockAuthed(
      { id: ITEM_ID, content: 'texto editado depois', title: null },
      await freshAiRun('texto original')
    );
    const { POST } = await import('@/app/api/audio/link-calendar-event/route');
    const res = await POST(jsonRequest(baseBody()));
    expect(res.status).toBe(409);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('persiste o vínculo do evento já criado, sem nunca tocar o Google', async () => {
    const { getSupabaseAdminClient } = await import('@/platform/supabase/admin-client');
    const upsertedLinks: Record<string, unknown>[] = [];
    vi.mocked(getSupabaseAdminClient).mockReturnValue({
      from: () => ({
        upsert: async (v: Record<string, unknown>) => {
          upsertedLinks.push(v);
          return { error: null };
        },
      }),
    } as never);
    await mockAuthed({ id: ITEM_ID, content: 'transcrição atual', title: null }, await freshAiRun('transcrição atual'));

    const { POST } = await import('@/app/api/audio/link-calendar-event/route');
    const res = await POST(jsonRequest(baseBody({ modality: 'online', meetingLink: 'https://meet.google.com/abc' })));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('linked');
    expect(upsertedLinks).toHaveLength(1);
    expect(upsertedLinks[0].google_event_id).toBe('event-1');
    expect(upsertedLinks[0].meeting_link).toBe('https://meet.google.com/abc');
    expect(upsertedLinks[0].created_by_panel).toBe(true);
  });

  it('retry após falha não duplica: nova tentativa só reenvia o mesmo upsert (onConflict: item_id)', async () => {
    const { getSupabaseAdminClient } = await import('@/platform/supabase/admin-client');
    let call = 0;
    const upsertedLinks: Record<string, unknown>[] = [];
    vi.mocked(getSupabaseAdminClient).mockReturnValue({
      from: () => ({
        upsert: async (v: Record<string, unknown>) => {
          call += 1;
          if (call === 1) return { error: { message: 'timeout' } };
          upsertedLinks.push(v);
          return { error: null };
        },
      }),
    } as never);
    await mockAuthed({ id: ITEM_ID, content: 'transcrição atual', title: null }, await freshAiRun('transcrição atual'));

    const { POST } = await import('@/app/api/audio/link-calendar-event/route');
    const first = await POST(jsonRequest(baseBody()));
    expect(first.status).toBe(502);

    const second = await POST(jsonRequest(baseBody()));
    expect(second.status).toBe(200);
    expect(upsertedLinks).toHaveLength(1); // um único registro persistido, mesmo após retry
  });
});

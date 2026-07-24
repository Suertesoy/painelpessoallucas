// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setAudioTriageStructurerFactory, type AudioTriageStructurer } from '@/platform/ai/audio-triage-structurer';
import { AudioTriageProposalSchema } from '@/platform/ai/audio-triage.schema';
import { getSessionContext } from '@/platform/supabase/session';
import { POST } from '@/app/api/ai/triage-capture/route';

/**
 * POST /api/ai/triage-capture — sem chamadas reais à OpenAI. Cobre a regra
 * central da Etapa 3: a captura (item) já existe antes desta rota rodar e
 * NUNCA é tocada por ela, nem em caso de falha da IA — só ai_runs registra
 * o resultado da tentativa.
 *
 * Sem vi.resetModules(): quebraria o singleton da fábrica injetável de
 * AudioTriageStructurer entre o teste e a rota (mesma razão documentada em
 * audio-transcribe-route.test.ts).
 */

vi.mock('server-only', () => ({}));
vi.mock('@/platform/supabase/session', () => ({
  getSessionContext: vi.fn(),
}));

const ITEM_ID = '22222222-2222-4222-8222-222222222222';

const validProposal = {
  intent: 'task',
  suggestedTitle: 'Ligar para o cliente',
  summary: 'Lembrete de ligação para o cliente amanhã de manhã.',
  projectCandidates: [],
  proposedActions: [],
  calendarProposal: null,
  missingInformation: [],
  overallConfidence: 0.9,
};

function chainableSingle(data: unknown, error: unknown = null) {
  const obj: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'neq', 'order', 'limit']) {
    obj[m] = () => obj;
  }
  obj.maybeSingle = async () => ({ data, error });
  return obj;
}

function chainableList(data: unknown[], error: unknown = null) {
  const obj: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'neq', 'order']) {
    obj[m] = () => obj;
  }
  obj.limit = () => Promise.resolve({ data, error });
  // projects query termina em .order(...) sem .limit(...), então também
  // precisa ser thenable diretamente.
  obj.then = (...args: Parameters<PromiseLike<unknown>['then']>) => Promise.resolve({ data, error }).then(...args);
  return obj;
}

function createFakeSupabase(opts: {
  item?: Record<string, unknown> | null;
  projects?: Record<string, unknown>[];
  recentItems?: Record<string, unknown>[];
  aiRunId?: string;
  aiRunInsertError?: unknown;
  onAiRunUpdate?: (values: Record<string, unknown>) => void;
}) {
  let itemsCallCount = 0;
  return {
    from: (table: string) => {
      if (table === 'items') {
        itemsCallCount += 1;
        if (itemsCallCount === 1) {
          return chainableSingle(opts.item ?? null);
        }
        return chainableList(opts.recentItems ?? []);
      }
      if (table === 'projects') {
        return chainableList(opts.projects ?? []);
      }
      if (table === 'ai_runs') {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: opts.aiRunInsertError ? null : { id: opts.aiRunId ?? 'run-1' },
                error: opts.aiRunInsertError ?? null,
              }),
            }),
          }),
          update: (values: Record<string, unknown>) => ({
            eq: async () => {
              opts.onAiRunUpdate?.(values);
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`tabela inesperada no mock: ${table}`);
    },
  };
}

function jsonRequest(body: unknown): Request {
  return new Request('http://x/api/ai/triage-capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  setAudioTriageStructurerFactory(null);
});

afterEach(() => {
  setAudioTriageStructurerFactory(null);
});

describe('POST /api/ai/triage-capture', () => {
  it('rejeita requisição sem sessão (401)', async () => {
    vi.mocked(getSessionContext).mockResolvedValue(null);

    const res = await POST(jsonRequest({ itemId: ITEM_ID }));
    expect(res.status).toBe(401);
  });

  it('não encontra captura de outro workspace (isolamento por RLS) — 404', async () => {
    const supabase = createFakeSupabase({ item: null });
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: supabase as never,
      user: { id: 'user-1' } as never,
      workspaceId: 'ws-1',
    });

    const res = await POST(jsonRequest({ itemId: ITEM_ID }));
    expect(res.status).toBe(404);
  });

  it('quando a IA falha, marca ai_runs como failed mas NUNCA toca no item — a captura continua salva', async () => {
    const updates: Record<string, unknown>[] = [];
    const supabase = createFakeSupabase({
      item: { id: ITEM_ID, workspace_id: 'ws-1', content: 'transcrição da captura', title: null },
      onAiRunUpdate: (v) => updates.push(v),
    });
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: supabase as never,
      user: { id: 'user-1' } as never,
      workspaceId: 'ws-1',
    });
    setAudioTriageStructurerFactory(() => ({
      triage: async () => {
        throw new Error('modelo indisponível');
      },
    }));

    const res = await POST(jsonRequest({ itemId: ITEM_ID }));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toContain('Sua captura continua salva');
    expect(updates.some((u) => u.status === 'failed')).toBe(true);
  });

  it('analisa com sucesso e devolve a proposta + aiRunId; ai_runs é marcado completed', async () => {
    const updates: Record<string, unknown>[] = [];
    const supabase = createFakeSupabase({
      item: { id: ITEM_ID, workspace_id: 'ws-1', content: 'ligar pro cliente amanhã', title: null },
      aiRunId: 'run-xyz',
      onAiRunUpdate: (v) => updates.push(v),
    });
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: supabase as never,
      user: { id: 'user-1' } as never,
      workspaceId: 'ws-1',
    });
    const mock: AudioTriageStructurer = {
      triage: async () => ({
        proposal: AudioTriageProposalSchema.parse(validProposal),
        usage: { model: 'mock-model', inputTokens: 10, outputTokens: 20 },
      }),
    };
    setAudioTriageStructurerFactory(() => mock);

    const res = await POST(jsonRequest({ itemId: ITEM_ID }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.aiRunId).toBe('run-xyz');
    expect(body.proposal.suggestedTitle).toBe(validProposal.suggestedTitle);
    expect(updates.some((u) => u.status === 'completed')).toBe(true);
  });

  it('captura sem conteúdo não é enviada para análise (400)', async () => {
    const supabase = createFakeSupabase({
      item: { id: ITEM_ID, workspace_id: 'ws-1', content: '', title: null },
    });
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: supabase as never,
      user: { id: 'user-1' } as never,
      workspaceId: 'ws-1',
    });

    const res = await POST(jsonRequest({ itemId: ITEM_ID }));
    expect(res.status).toBe(400);
  });

  it('idempotência: reenviar a mesma chave dentro da janela é rejeitado, não reprocessado', async () => {
    const supabase = createFakeSupabase({
      item: { id: ITEM_ID, workspace_id: 'ws-1', content: 'algo', title: null },
    });
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: supabase as never,
      user: { id: 'user-1' } as never,
      workspaceId: 'ws-1',
    });
    setAudioTriageStructurerFactory(() => ({
      triage: async () => ({
        proposal: AudioTriageProposalSchema.parse(validProposal),
        usage: { model: 'mock-model' },
      }),
    }));

    const first = await POST(jsonRequest({ itemId: ITEM_ID, idempotencyKey: 'chave-unica-idempotencia' }));
    expect(first.status).toBe(200);

    const second = await POST(jsonRequest({ itemId: ITEM_ID, idempotencyKey: 'chave-unica-idempotencia' }));
    expect(second.status).toBe(409);
  });
});

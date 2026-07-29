// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sha256Hex } from '@/lib/text-hash';
import { getSessionContext } from '@/platform/supabase/session';
import { POST } from '@/app/api/ai/confirm-triage-action/route';

/**
 * POST /api/ai/confirm-triage-action — aplica (cria ou atualiza) UMA ação
 * aprovada na revisão da triagem por IA. É a peça central da regra "análise
 * desatualizada": o servidor SEMPRE recalcula o hash do conteúdo atual da
 * captura e compara com ai_runs.input_hash antes de gravar qualquer coisa —
 * uma proposta baseada em texto antigo é rejeitada, mesmo que o cliente
 * tente confirmá-la (não é uma checagem só visual).
 */

vi.mock('server-only', () => ({}));
vi.mock('@/platform/supabase/session', () => ({ getSessionContext: vi.fn() }));

const ITEM_ID = '22222222-2222-4222-8222-222222222222';
const AI_RUN_ID = '99999999-9999-4999-8999-999999999999';

function fakeSupabase(opts: {
  item: Record<string, unknown> | null;
  aiRun?: Record<string, unknown> | null;
  writeError?: { message: string } | null;
  onItemsInsert?: (v: unknown) => void;
  onItemsUpdate?: (v: unknown) => void;
  onEventsInsert?: (v: unknown) => void;
}) {
  return {
    from: (table: string) => {
      if (table === 'items') {
        return {
          select: () => {
            const chain: Record<string, unknown> = {};
            for (const m of ['eq', 'is']) chain[m] = () => chain;
            chain.maybeSingle = async () => ({ data: opts.item, error: null });
            return chain;
          },
          insert: (v: unknown) => {
            opts.onItemsInsert?.(v);
            return Promise.resolve({ error: opts.writeError ?? null });
          },
          update: (v: unknown) => {
            opts.onItemsUpdate?.(v);
            return { eq: async () => ({ error: opts.writeError ?? null }) };
          },
        };
      }
      if (table === 'ai_runs') {
        const chain: Record<string, unknown> = {};
        for (const m of ['select', 'eq']) chain[m] = () => chain;
        chain.maybeSingle = async () => ({ data: opts.aiRun ?? null, error: null });
        return chain;
      }
      if (table === 'domain_events') {
        return {
          insert: (v: unknown) => {
            opts.onEventsInsert?.(v);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`tabela inesperada no mock: ${table}`);
    },
  };
}

async function freshAiRun(content: string) {
  return { id: AI_RUN_ID, item_id: ITEM_ID, status: 'completed', input_hash: await sha256Hex(content) };
}

function baseItem(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    title: 'Ligar para o cliente',
    content: 'transcrição analisada',
    type: 'note',
    status: 'inbox',
    priority: 'normal',
    project_id: null,
    due_at: null,
    scheduled_at: null,
    estimated_minutes: null,
    next_action: null,
    source: 'audio_capture',
    ...overrides,
  };
}

function jsonRequest(body: unknown): Request {
  return new Request('http://x/api/ai/confirm-triage-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/ai/confirm-triage-action', () => {
  it('rejeita requisição sem sessão (401)', async () => {
    vi.mocked(getSessionContext).mockResolvedValue(null);
    const res = await POST(
      jsonRequest({ itemId: ITEM_ID, aiRunId: AI_RUN_ID, actionType: 'create_item', action: { title: 'x' } })
    );
    expect(res.status).toBe(401);
  });

  it('rejeita corpo inválido (400)', async () => {
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({ item: null }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });
    const res = await POST(jsonRequest({ itemId: 'não-é-uuid' }));
    expect(res.status).toBe(400);
  });

  it('captura não encontrada sob RLS (404)', async () => {
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({ item: null }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });
    const res = await POST(
      jsonRequest({ itemId: ITEM_ID, aiRunId: AI_RUN_ID, actionType: 'create_item', action: { title: 'x' } })
    );
    expect(res.status).toBe(404);
  });

  it('proposta desatualizada (transcrição mudou depois da análise): 409, nenhuma escrita acontece', async () => {
    const onItemsInsert = vi.fn();
    const onEventsInsert = vi.fn();
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({
        item: baseItem({ content: 'texto editado depois da análise' }),
        aiRun: await freshAiRun('texto ORIGINAL analisado'),
        onItemsInsert,
        onEventsInsert,
      }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });

    const res = await POST(
      jsonRequest({
        itemId: ITEM_ID,
        aiRunId: AI_RUN_ID,
        actionType: 'create_item',
        action: { title: 'Preparar pauta' },
      })
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.errorCategory).toBe('stale_analysis');
    expect(body.error).toContain('Analise novamente');
    expect(onItemsInsert).not.toHaveBeenCalled();
    expect(onEventsInsert).not.toHaveBeenCalled();
  });

  it('análise ainda não concluída: proposta não pode ser confirmada (404/análise não encontrada)', async () => {
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({
        item: baseItem(),
        aiRun: { id: AI_RUN_ID, item_id: ITEM_ID, status: 'running', input_hash: 'qualquer' },
      }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });

    const res = await POST(
      jsonRequest({ itemId: ITEM_ID, aiRunId: AI_RUN_ID, actionType: 'create_item', action: { title: 'x' } })
    );
    expect(res.status).toBe(404);
  });

  it('create_item: cria o novo item com source "ai" e registra item.created em domain_events', async () => {
    const onItemsInsert = vi.fn();
    const onEventsInsert = vi.fn();
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({
        item: baseItem(),
        aiRun: await freshAiRun('transcrição analisada'),
        onItemsInsert,
        onEventsInsert,
      }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });

    const res = await POST(
      jsonRequest({
        itemId: ITEM_ID,
        aiRunId: AI_RUN_ID,
        actionType: 'create_item',
        action: { title: 'Preparar a nova proposta', description: 'detalhes', itemType: 'task', priority: 'high' },
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('created');
    expect(onItemsInsert).toHaveBeenCalledTimes(1);
    const insertedRow = onItemsInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedRow).toMatchObject({
      title: 'Preparar a nova proposta',
      content: 'detalhes',
      type: 'task',
      status: 'organized',
      priority: 'high',
      source: 'ai',
    });
    expect(onEventsInsert).toHaveBeenCalledTimes(1);
    expect((onEventsInsert.mock.calls[0][0] as Record<string, unknown>).type).toBe('item.created');
  });

  it('update_capture: atualiza a própria captura e registra item.updated com previous/new', async () => {
    const onItemsUpdate = vi.fn();
    const onEventsInsert = vi.fn();
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({
        item: baseItem(),
        aiRun: await freshAiRun('transcrição analisada'),
        onItemsUpdate,
        onEventsInsert,
      }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });

    const res = await POST(
      jsonRequest({
        itemId: ITEM_ID,
        aiRunId: AI_RUN_ID,
        actionType: 'update_capture',
        action: { title: 'Ligar para o cliente amanhã', itemType: 'task' },
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('updated');
    expect(onItemsUpdate).toHaveBeenCalledTimes(1);
    const updatedRow = onItemsUpdate.mock.calls[0][0] as Record<string, unknown>;
    expect(updatedRow).toMatchObject({ title: 'Ligar para o cliente amanhã', type: 'task' });
    expect(onEventsInsert).toHaveBeenCalledTimes(1);
    const event = onEventsInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(event.type).toBe('item.updated');
    expect((event.payload as { previous: unknown; new: unknown }).previous).toBeTruthy();
  });

  it('falha ao gravar: erro compreensível, sem expor detalhes internos do banco', async () => {
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({
        item: baseItem(),
        aiRun: await freshAiRun('transcrição analisada'),
        writeError: { message: 'duplicate key value violates unique constraint "items_pkey"' },
      }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });

    const res = await POST(
      jsonRequest({ itemId: ITEM_ID, aiRunId: AI_RUN_ID, actionType: 'create_item', action: { title: 'x' } })
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).not.toContain('constraint');
    expect(body.error).not.toContain('items_pkey');
  });
});

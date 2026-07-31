// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sha256Hex } from '@/lib/text-hash';
import { getSessionContext } from '@/platform/supabase/session';
import { POST } from '@/app/api/ai/confirm-triage-action/route';
import type { ShoppingListRow } from '@/modules/shopping/infrastructure/shopping-list-row';

/**
 * Integração entre a triagem inteligente e a lista de compras:
 * - shopping_item confirmado sem lista escolhida vai para Mercado.
 * - lista escolhida na revisão é respeitada (quando pertence ao workspace).
 * - um shoppingListId estranho/de outro workspace nunca é confiado (cai para Mercado).
 * - a confirmação retentada (mesmo aiRunId+actionIndex) não duplica o item.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/platform/supabase/session', () => ({ getSessionContext: vi.fn() }));

const ITEM_ID = '22222222-2222-4222-8222-222222222222';
const AI_RUN_ID = '99999999-9999-4999-8999-999999999999';
const WORKSPACE_ID = 'ws-1';

function fakeSupabase(opts: {
  existingLists?: ShoppingListRow[];
  onItemsInsert?: (v: Record<string, unknown>) => void;
}) {
  const lists: ShoppingListRow[] = [...(opts.existingLists ?? [])];
  const insertedIds = new Set<string>();

  return {
    lists,
    from: (table: string) => {
      if (table === 'items') {
        return {
          select: () => {
            const chain: Record<string, unknown> = {};
            for (const m of ['eq', 'is']) chain[m] = () => chain;
            chain.maybeSingle = async () => ({
              data: {
                id: ITEM_ID,
                title: 'captura',
                content: 'leite, pão e café',
                type: 'note',
                status: 'inbox',
                priority: 'normal',
                project_id: null,
                due_at: null,
                scheduled_at: null,
                estimated_minutes: null,
                next_action: null,
                source: 'quick_capture',
              },
              error: null,
            });
            return chain;
          },
          insert: (v: Record<string, unknown>) => {
            opts.onItemsInsert?.(v);
            const id = v.id as string;
            if (insertedIds.has(id)) {
              return Promise.resolve({
                error: { message: 'duplicate key value violates unique constraint "items_pkey"', code: '23505' },
              });
            }
            insertedIds.add(id);
            return Promise.resolve({ error: null });
          },
          update: () => {
            // Backfill de shopping_item antigos: não há nenhum neste mock.
            const chain: Record<string, unknown> = {};
            for (const m of ['eq', 'is']) chain[m] = () => chain;
            chain.select = async () => ({ data: [], error: null });
            return chain;
          },
        };
      }
      if (table === 'ai_runs') {
        const chain: Record<string, unknown> = {};
        for (const m of ['select', 'eq']) chain[m] = () => chain;
        chain.maybeSingle = async () => ({
          data: { id: AI_RUN_ID, item_id: ITEM_ID, status: 'completed', input_hash: 'HASH_PLACEHOLDER' },
          error: null,
        });
        return chain;
      }
      if (table === 'domain_events') {
        return { insert: () => Promise.resolve({ error: null }) };
      }
      if (table === 'shopping_lists') {
        return {
          upsert: (rows: { workspace_id: string; slug: string; name: string }[]) => {
            const created: ShoppingListRow[] = [];
            for (const row of rows) {
              const exists = lists.some((l) => l.workspace_id === row.workspace_id && l.slug === row.slug);
              if (!exists) {
                const newRow: ShoppingListRow = {
                  id: crypto.randomUUID(),
                  workspace_id: row.workspace_id,
                  slug: row.slug,
                  name: row.name,
                  created_at: '2026-07-31T10:00:00.000Z',
                  updated_at: '2026-07-31T10:00:00.000Z',
                };
                lists.push(newRow);
                created.push(newRow);
              }
            }
            return { select: async () => ({ data: created, error: null }) };
          },
          select: () => {
            let workspaceId: string | undefined;
            const builder = {
              eq(_col: string, val: string) {
                workspaceId = val;
                return builder;
              },
              then(resolve: (v: { data: ShoppingListRow[]; error: null }) => void) {
                resolve({ data: lists.filter((l) => l.workspace_id === workspaceId), error: null });
              },
            };
            return builder;
          },
        };
      }
      throw new Error(`tabela inesperada no mock: ${table}`);
    },
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

async function mockSessionWithFreshRun(supabase: ReturnType<typeof fakeSupabase>) {
  // Recalcula o hash real do conteúdo mockado para não cair em "stale_analysis".
  const inputHash = await sha256Hex('leite, pão e café');
  const original = supabase.from.bind(supabase);
  supabase.from = ((table: string) => {
    if (table === 'ai_runs') {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq']) chain[m] = () => chain;
      chain.maybeSingle = async () => ({
        data: { id: AI_RUN_ID, item_id: ITEM_ID, status: 'completed', input_hash: inputHash },
        error: null,
      });
      return chain;
    }
    return original(table);
  }) as typeof supabase.from;
  return supabase;
}

describe('POST /api/ai/confirm-triage-action — shopping_item', () => {
  it('sem shoppingListId escolhido, vai para Mercado (destino padrão)', async () => {
    const onItemsInsert = vi.fn();
    const supabase = await mockSessionWithFreshRun(fakeSupabase({ onItemsInsert }));
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: supabase as never,
      user: { id: 'u1' } as never,
      workspaceId: WORKSPACE_ID,
    });

    const res = await POST(
      jsonRequest({
        itemId: ITEM_ID,
        aiRunId: AI_RUN_ID,
        actionIndex: 0,
        actionType: 'create_item',
        action: { title: 'Leite', itemType: 'shopping_item' },
      })
    );
    expect(res.status).toBe(200);

    const mercado = supabase.lists.find((l) => l.slug === 'mercado');
    const insertedRow = onItemsInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedRow.shopping_list_id).toBe(mercado?.id);
  });

  it('respeita a lista escolhida na revisão quando pertence ao workspace', async () => {
    const onItemsInsert = vi.fn();
    const supabase = await mockSessionWithFreshRun(fakeSupabase({ onItemsInsert }));
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: supabase as never,
      user: { id: 'u1' } as never,
      workspaceId: WORKSPACE_ID,
    });

    // Primeira chamada garante que Mercado/Internet existam.
    await POST(
      jsonRequest({
        itemId: ITEM_ID,
        aiRunId: AI_RUN_ID,
        actionIndex: 0,
        actionType: 'create_item',
        action: { title: 'Leite', itemType: 'shopping_item' },
      })
    );
    const internet = supabase.lists.find((l) => l.slug === 'internet')!;

    onItemsInsert.mockClear();
    await POST(
      jsonRequest({
        itemId: ITEM_ID,
        aiRunId: AI_RUN_ID,
        actionIndex: 1,
        actionType: 'create_item',
        action: { title: 'Assinatura streaming', itemType: 'shopping_item', shoppingListId: internet.id },
      })
    );

    const insertedRow = onItemsInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedRow.shopping_list_id).toBe(internet.id);
  });

  it('shoppingListId que não pertence ao workspace é ignorado — cai para Mercado', async () => {
    const onItemsInsert = vi.fn();
    const supabase = await mockSessionWithFreshRun(fakeSupabase({ onItemsInsert }));
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: supabase as never,
      user: { id: 'u1' } as never,
      workspaceId: WORKSPACE_ID,
    });

    const res = await POST(
      jsonRequest({
        itemId: ITEM_ID,
        aiRunId: AI_RUN_ID,
        actionIndex: 0,
        actionType: 'create_item',
        action: {
          title: 'Leite',
          itemType: 'shopping_item',
          shoppingListId: '99999999-0000-4000-8000-000000000000',
        },
      })
    );
    expect(res.status).toBe(200);

    const mercado = supabase.lists.find((l) => l.slug === 'mercado');
    const insertedRow = onItemsInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedRow.shopping_list_id).toBe(mercado?.id);
  });

  it('confirmar a mesma ação duas vezes (retry) não cria um item duplicado', async () => {
    const onItemsInsert = vi.fn();
    const supabase = await mockSessionWithFreshRun(fakeSupabase({ onItemsInsert }));
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: supabase as never,
      user: { id: 'u1' } as never,
      workspaceId: WORKSPACE_ID,
    });

    const body = {
      itemId: ITEM_ID,
      aiRunId: AI_RUN_ID,
      actionIndex: 0,
      actionType: 'create_item',
      action: { title: 'Leite', itemType: 'shopping_item' },
    };

    const first = await POST(jsonRequest(body));
    const second = await POST(jsonRequest(body));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(secondBody.itemId).toBe(firstBody.itemId);
    expect(onItemsInsert).toHaveBeenCalledTimes(2);
  });

  it('tipos não shopping_item continuam sem shopping_list_id', async () => {
    const onItemsInsert = vi.fn();
    const supabase = await mockSessionWithFreshRun(fakeSupabase({ onItemsInsert }));
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: supabase as never,
      user: { id: 'u1' } as never,
      workspaceId: WORKSPACE_ID,
    });

    await POST(
      jsonRequest({
        itemId: ITEM_ID,
        aiRunId: AI_RUN_ID,
        actionIndex: 0,
        actionType: 'create_item',
        action: { title: 'Ligar para o cliente', itemType: 'task' },
      })
    );

    const insertedRow = onItemsInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedRow.shopping_list_id).toBeNull();
  });
});

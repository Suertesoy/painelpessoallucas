// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { ensureDefaultShoppingLists } from '@/modules/shopping/infrastructure/ensure-default-shopping-lists';
import { SupabaseShoppingListRepository } from '@/modules/shopping/infrastructure/supabase-shopping-list.repository';
import type { ShoppingListRow } from '@/modules/shopping/infrastructure/shopping-list-row';

/**
 * Garantia de Mercado/Internet (idempotente, isolada por workspace) + o
 * backfill determinístico dos shopping_item antigos sem lista. Testa a
 * função compartilhada usada tanto pelo repositório do cliente quanto pela
 * rota de confirmação da triagem (/api/ai/confirm-triage-action).
 */

type FakeItemRow = {
  id: string;
  workspace_id: string;
  type: string;
  shopping_list_id: string | null;
  deleted_at: string | null;
};

function makeFakeSupabase(seed: { lists?: ShoppingListRow[]; items?: FakeItemRow[] } = {}) {
  const state = { lists: [...(seed.lists ?? [])], items: [...(seed.items ?? [])] };

  return {
    state,
    from(table: string) {
      if (table === 'shopping_lists') {
        return {
          upsert(rows: { workspace_id: string; slug: string; name: string }[]) {
            const created: ShoppingListRow[] = [];
            for (const row of rows) {
              const exists = state.lists.some(
                (l) => l.workspace_id === row.workspace_id && l.slug === row.slug
              );
              if (!exists) {
                const newRow: ShoppingListRow = {
                  id: crypto.randomUUID(),
                  workspace_id: row.workspace_id,
                  slug: row.slug,
                  name: row.name,
                  created_at: '2026-07-31T10:00:00.000Z',
                  updated_at: '2026-07-31T10:00:00.000Z',
                };
                state.lists.push(newRow);
                created.push(newRow);
              }
            }
            return { select: async () => ({ data: created, error: null }) };
          },
          select() {
            let workspaceId: string | undefined;
            const builder = {
              eq(_col: string, val: string) {
                workspaceId = val;
                return builder;
              },
              then(resolve: (v: { data: ShoppingListRow[]; error: null }) => void) {
                resolve({ data: state.lists.filter((l) => l.workspace_id === workspaceId), error: null });
              },
            };
            return builder;
          },
        };
      }
      if (table === 'items') {
        return {
          update(patch: { shopping_list_id: string }) {
            const filters: Record<string, string | null> = {};
            const builder = {
              eq(col: string, val: string) {
                filters[col] = val;
                return builder;
              },
              is(col: string, val: null) {
                filters[col] = val;
                return builder;
              },
              select() {
                const affected = state.items.filter(
                  (i) =>
                    i.workspace_id === filters.workspace_id &&
                    i.type === filters.type &&
                    i.shopping_list_id === filters.shopping_list_id &&
                    i.deleted_at === filters.deleted_at
                );
                affected.forEach((i) => {
                  i.shopping_list_id = patch.shopping_list_id;
                });
                return Promise.resolve({ data: affected.map((i) => ({ id: i.id })), error: null });
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

const WS_A = 'ws-a';
const WS_B = 'ws-b';

describe('ensureDefaultShoppingLists', () => {
  it('cria Mercado e Internet num workspace novo', async () => {
    const supabase = makeFakeSupabase();
    const result = await ensureDefaultShoppingLists(supabase as never, WS_A);

    expect(result.lists.map((l) => l.slug).sort()).toEqual(['internet', 'mercado']);
    expect(result.created.map((l) => l.slug).sort()).toEqual(['internet', 'mercado']);
  });

  it('é idempotente: a segunda chamada não cria listas nem duplica', async () => {
    const supabase = makeFakeSupabase();
    await ensureDefaultShoppingLists(supabase as never, WS_A);
    const second = await ensureDefaultShoppingLists(supabase as never, WS_A);

    expect(second.created).toHaveLength(0);
    expect(second.lists).toHaveLength(2);
    expect(supabase.state.lists.filter((l) => l.workspace_id === WS_A)).toHaveLength(2);
  });

  it('isola listas por workspace — abrir em dois workspaces não mistura nem duplica', async () => {
    const supabase = makeFakeSupabase();
    const a = await ensureDefaultShoppingLists(supabase as never, WS_A);
    const b = await ensureDefaultShoppingLists(supabase as never, WS_B);

    expect(a.lists.every((l) => l.workspaceId === WS_A)).toBe(true);
    expect(b.lists.every((l) => l.workspaceId === WS_B)).toBe(true);
    expect(a.lists.map((l) => l.id)).not.toEqual(b.lists.map((l) => l.id));
  });

  it('migra shopping_item antigos sem lista para Mercado (backfill determinístico)', async () => {
    const supabase = makeFakeSupabase({
      items: [
        { id: 'item-1', workspace_id: WS_A, type: 'shopping_item', shopping_list_id: null, deleted_at: null },
        { id: 'item-2', workspace_id: WS_A, type: 'shopping_item', shopping_list_id: null, deleted_at: null },
        // Não deve tocar: já tem lista, é de outro tipo, está excluído, ou é de outro workspace.
        { id: 'item-3', workspace_id: WS_A, type: 'shopping_item', shopping_list_id: 'other-list', deleted_at: null },
        { id: 'item-4', workspace_id: WS_A, type: 'task', shopping_list_id: null, deleted_at: null },
        { id: 'item-5', workspace_id: WS_A, type: 'shopping_item', shopping_list_id: null, deleted_at: '2026-01-01T00:00:00.000Z' },
        { id: 'item-6', workspace_id: WS_B, type: 'shopping_item', shopping_list_id: null, deleted_at: null },
      ],
    });

    const result = await ensureDefaultShoppingLists(supabase as never, WS_A);
    const mercado = result.lists.find((l) => l.slug === 'mercado')!;

    expect(result.backfilledCount).toBe(2);
    expect(supabase.state.items.find((i) => i.id === 'item-1')?.shopping_list_id).toBe(mercado.id);
    expect(supabase.state.items.find((i) => i.id === 'item-2')?.shopping_list_id).toBe(mercado.id);
    expect(supabase.state.items.find((i) => i.id === 'item-3')?.shopping_list_id).toBe('other-list');
    expect(supabase.state.items.find((i) => i.id === 'item-4')?.shopping_list_id).toBeNull();
    expect(supabase.state.items.find((i) => i.id === 'item-5')?.shopping_list_id).toBeNull();
    expect(supabase.state.items.find((i) => i.id === 'item-6')?.shopping_list_id).toBeNull();
  });

  it('não repete o backfill em chamadas seguintes (idempotente)', async () => {
    const supabase = makeFakeSupabase({
      items: [{ id: 'item-1', workspace_id: WS_A, type: 'shopping_item', shopping_list_id: null, deleted_at: null }],
    });
    await ensureDefaultShoppingLists(supabase as never, WS_A);
    const second = await ensureDefaultShoppingLists(supabase as never, WS_A);
    expect(second.backfilledCount).toBe(0);
  });
});

describe('SupabaseShoppingListRepository.ensureDefaultLists', () => {
  it('notifica os assinantes quando cria listas ou faz backfill', async () => {
    const supabase = makeFakeSupabase({
      items: [{ id: 'item-1', workspace_id: WS_A, type: 'shopping_item', shopping_list_id: null, deleted_at: null }],
    });
    let notified = 0;
    const fakeNotifier = { notify: () => { notified += 1; }, subscribe: () => () => {} };
    const repo = new SupabaseShoppingListRepository(supabase as never, WS_A, fakeNotifier as never);

    await repo.ensureDefaultLists();
    expect(notified).toBe(1);
  });

  it('não notifica em chamadas repetidas (nada mudou)', async () => {
    const supabase = makeFakeSupabase();
    let notified = 0;
    const fakeNotifier = { notify: () => { notified += 1; }, subscribe: () => () => {} };
    const repo = new SupabaseShoppingListRepository(supabase as never, WS_A, fakeNotifier as never);

    await repo.ensureDefaultLists();
    notified = 0;
    await repo.ensureDefaultLists();
    expect(notified).toBe(0);
  });

  it('findAll ordena Mercado antes de Internet', async () => {
    const supabase = makeFakeSupabase();
    const fakeNotifier = { notify: () => {}, subscribe: () => () => {} };
    const repo = new SupabaseShoppingListRepository(supabase as never, WS_A, fakeNotifier as never);

    await repo.ensureDefaultLists();
    const lists = await repo.findAll();
    expect(lists.map((l) => l.slug)).toEqual(['mercado', 'internet']);
  });
});

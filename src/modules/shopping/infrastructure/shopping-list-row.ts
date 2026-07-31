import { ShoppingList, ShoppingListSchema, DEFAULT_SHOPPING_LISTS } from '../domain/shopping-list.schema';

/**
 * Mapper puro (sem 'use client', sem ChangeNotifier) — importável tanto pelo
 * repositório do cliente (SupabaseShoppingListRepository) quanto por rotas de
 * servidor (ex.: /api/ai/confirm-triage-action, via ensureDefaultShoppingLists).
 */

export type ShoppingListRow = {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export function rowToShoppingList(row: ShoppingListRow): ShoppingList {
  return ShoppingListSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    slug: row.slug,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

/** Ordena as listas padrão na ordem declarada (Mercado, Internet); demais listas futuras, por criação. */
export function sortShoppingLists(lists: ShoppingList[]): ShoppingList[] {
  const order = new Map(DEFAULT_SHOPPING_LISTS.map((l, i) => [l.slug, i]));
  return lists.slice().sort((a, b) => {
    const oa = order.has(a.slug) ? order.get(a.slug)! : DEFAULT_SHOPPING_LISTS.length;
    const ob = order.has(b.slug) ? order.get(b.slug)! : DEFAULT_SHOPPING_LISTS.length;
    if (oa !== ob) return oa - ob;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

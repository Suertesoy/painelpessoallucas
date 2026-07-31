import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ShoppingList,
  DEFAULT_SHOPPING_LISTS,
  FALLBACK_SHOPPING_LIST_SLUG,
} from '../domain/shopping-list.schema';
import { rowToShoppingList, ShoppingListRow } from './shopping-list-row';

export interface EnsureDefaultShoppingListsResult {
  lists: ShoppingList[];
  created: ShoppingList[];
  backfilledCount: number;
}

/**
 * Núcleo idempotente de "garantir Mercado/Internet + backfill de shopping_item
 * antigos", independente de cliente (browser ou servidor) e sem depender do
 * ChangeNotifier — usado tanto por SupabaseShoppingListRepository (cliente,
 * que ainda dispara notify()) quanto pela rota de confirmação da triagem
 * (servidor, /api/ai/confirm-triage-action), que precisa garantir que a
 * lista de destino exista antes de vincular um novo item de compra.
 */
export async function ensureDefaultShoppingLists(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<EnsureDefaultShoppingListsResult> {
  const { data: createdRows, error: upsertError } = await supabase
    .from('shopping_lists')
    .upsert(
      DEFAULT_SHOPPING_LISTS.map((l) => ({ workspace_id: workspaceId, slug: l.slug, name: l.name })),
      { onConflict: 'workspace_id,slug', ignoreDuplicates: true }
    )
    .select();
  if (upsertError) {
    throw new Error(`Não foi possível preparar as listas de compras: ${upsertError.message}`);
  }
  const created = ((createdRows as ShoppingListRow[] | null) ?? []).map(rowToShoppingList);

  const { data: allRows, error: selectError } = await supabase
    .from('shopping_lists')
    .select('*')
    .eq('workspace_id', workspaceId);
  if (selectError) {
    throw new Error(`Não foi possível carregar as listas de compras: ${selectError.message}`);
  }
  const lists = ((allRows as ShoppingListRow[] | null) ?? []).map(rowToShoppingList);

  const fallback = lists.find((l) => l.slug === FALLBACK_SHOPPING_LIST_SLUG);
  let backfilledCount = 0;
  if (fallback) {
    const { data: backfilledRows, error: backfillError } = await supabase
      .from('items')
      .update({ shopping_list_id: fallback.id })
      .eq('workspace_id', workspaceId)
      .eq('type', 'shopping_item')
      .is('shopping_list_id', null)
      .is('deleted_at', null)
      .select('id');
    if (backfillError) {
      throw new Error(`Não foi possível migrar itens de compra antigos: ${backfillError.message}`);
    }
    backfilledCount = ((backfilledRows as { id: string }[] | null) ?? []).length;
  }

  return { lists, created, backfilledCount };
}

'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { ShoppingList } from '../domain/shopping-list.schema';
import { EnsureDefaultListsResult, ShoppingListRepository } from '../application/shopping-list.repository';
import { ChangeNotifier } from '@/platform/supabase/change-notifier';
import { rowToShoppingList, sortShoppingLists, ShoppingListRow } from './shopping-list-row';
import { ensureDefaultShoppingLists } from './ensure-default-shopping-lists';

export class SupabaseShoppingListRepository implements ShoppingListRepository {
  constructor(
    private supabase: SupabaseClient,
    private workspaceId: string,
    private notifier: ChangeNotifier
  ) {}

  async findAll(): Promise<ShoppingList[]> {
    const { data, error } = await this.supabase
      .from('shopping_lists')
      .select('*')
      .eq('workspace_id', this.workspaceId);
    if (error) {
      throw new Error(`Não foi possível carregar as listas de compras: ${error.message}`);
    }
    return sortShoppingLists((data as ShoppingListRow[]).map(rowToShoppingList));
  }

  async ensureDefaultLists(): Promise<EnsureDefaultListsResult> {
    const { lists, created, backfilledCount } = await ensureDefaultShoppingLists(
      this.supabase,
      this.workspaceId
    );

    if (created.length > 0 || backfilledCount > 0) {
      this.notifier.notify();
    }

    return { lists: sortShoppingLists(lists), created };
  }

  subscribe(listener: () => void): () => void {
    return this.notifier.subscribe(listener);
  }
}

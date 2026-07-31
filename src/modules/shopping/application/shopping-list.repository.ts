import { ShoppingList } from '../domain/shopping-list.schema';

export interface EnsureDefaultListsResult {
  lists: ShoppingList[];
  /** Listas efetivamente criadas nesta chamada (vazio em chamadas repetidas — idempotente). */
  created: ShoppingList[];
}

export interface ShoppingListRepository {
  findAll(): Promise<ShoppingList[]>;
  /**
   * Garante Mercado/Internet para o workspace atual (idempotente por slug) e
   * faz o backfill determinístico dos `shopping_item` antigos sem lista
   * (destino: a lista `mercado`). Seguro para chamar em toda visita a /compras.
   */
  ensureDefaultLists(): Promise<EnsureDefaultListsResult>;
  subscribe(listener: () => void): () => void;
}

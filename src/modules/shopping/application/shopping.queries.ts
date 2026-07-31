import { ShoppingListRepository } from './shopping-list.repository';
import { ShoppingList } from '../domain/shopping-list.schema';
import { ItemRepository } from '@/modules/items/application/item.repository';
import { Item } from '@/modules/items/domain/item.schema';

export interface ShoppingListBoard {
  list: ShoppingList;
  pending: Item[];
  purchased: Item[];
}

function splitAndSort(items: Item[]): { pending: Item[]; purchased: Item[] } {
  const pending = items
    .filter((i) => i.status !== 'completed')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const purchased = items
    .filter((i) => i.status === 'completed')
    .sort((a, b) => (a.completedAt ?? a.createdAt).localeCompare(b.completedAt ?? b.createdAt));
  return { pending, purchased };
}

export class ShoppingQueries {
  constructor(
    private listRepo: ShoppingListRepository,
    private itemRepo: ItemRepository
  ) {}

  async listLists(): Promise<ShoppingList[]> {
    return this.listRepo.findAll();
  }

  /**
   * Uma leitura única para toda a página /compras: listas + itens de compra
   * (não arquivados) já separados em pendentes/comprados e ordenados. Itens
   * de compra sem lista (não deveria acontecer após ensureDefaultLists, mas
   * é possível numa janela entre migration e backfill) não aparecem aqui —
   * a UI trata isso como indisponibilidade temporária, nunca como erro fatal.
   */
  async getBoard(): Promise<ShoppingListBoard[]> {
    const [lists, allItems] = await Promise.all([this.listRepo.findAll(), this.itemRepo.findAll()]);

    const shoppingItems = allItems.filter((i) => i.type === 'shopping_item' && i.status !== 'archived');

    return lists.map((list) => {
      const itemsForList = shoppingItems.filter((i) => i.shoppingListId === list.id);
      const { pending, purchased } = splitAndSort(itemsForList);
      return { list, pending, purchased };
    });
  }
}

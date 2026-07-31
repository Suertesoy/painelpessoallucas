import { ShoppingListRepository } from './shopping-list.repository';
import { ShoppingList } from '../domain/shopping-list.schema';
import { EventRepository } from '@/platform/events/event.repository';

export class ShoppingCommands {
  constructor(
    private listRepo: ShoppingListRepository,
    private eventRepo: EventRepository,
    private workspaceId: string
  ) {}

  /**
   * Garante Mercado/Internet para o workspace atual (idempotente) e migra
   * shopping_item antigos sem lista. Seguro chamar a cada visita a /compras.
   * Emite shopping_list.initialized só para listas realmente criadas nesta
   * chamada — chamadas seguintes não reemitem (mesmo padrão de
   * learning.course.initialized).
   */
  async ensureDefaultLists(): Promise<ShoppingList[]> {
    const { lists, created } = await this.listRepo.ensureDefaultLists();

    for (const list of created) {
      await this.eventRepo.save({
        id: crypto.randomUUID(),
        type: 'shopping_list.initialized',
        entityId: list.id,
        workspaceId: this.workspaceId,
        source: 'manual',
        payload: list,
        createdAt: new Date().toISOString(),
      });
    }

    return lists;
  }
}

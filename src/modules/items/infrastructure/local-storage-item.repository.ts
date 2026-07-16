import { ItemRepository } from '../application/item.repository';
import { Item } from '../domain/item.schema';
import { LocalStorageAdapter } from '@/platform/storage/local-storage-adapter';

export class LocalStorageItemRepository extends LocalStorageAdapter<Item> implements ItemRepository {
  constructor() {
    super('painelpessoal_items');
  }

  public save(item: Item): Promise<void> {
    const items = this.getItems();
    const index = items.findIndex(i => i.id === item.id);
    if (index >= 0) {
      items[index] = item;
    } else {
      items.push(item);
    }
    this.saveItems(items);
    return Promise.resolve();
  }

  public findById(id: string): Promise<Item | null> {
    const items = this.getItems();
    const item = items.find(i => i.id === id);
    return Promise.resolve(item || null);
  }

  public findAll(): Promise<Item[]> {
    return Promise.resolve(this.getItems());
  }

  public delete(id: string): Promise<void> {
    const items = this.getItems();
    const filtered = items.filter(i => i.id !== id);
    this.saveItems(filtered);
    return Promise.resolve();
  }
}

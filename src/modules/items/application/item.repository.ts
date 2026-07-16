export interface ItemRepository {
  save(item: import('../domain/item.schema').Item): Promise<void>;
  findById(id: string): Promise<import('../domain/item.schema').Item | null>;
  findAll(): Promise<import('../domain/item.schema').Item[]>;
  delete(id: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export interface EventRepository {
  save(event: import('./event.schema').DomainEvent): Promise<void>;
  findAll(): Promise<import('./event.schema').DomainEvent[]>;
}

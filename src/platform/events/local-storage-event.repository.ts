import { EventRepository } from './event.repository';
import { DomainEvent } from './event.schema';
import { LocalStorageAdapter } from '../storage/local-storage-adapter';

export class LocalStorageEventRepository extends LocalStorageAdapter<DomainEvent> implements EventRepository {
  constructor() {
    super('painelpessoal_events');
  }

  public save(event: DomainEvent): Promise<void> {
    const events = this.getItems();
    events.push(event); // events are append-only
    this.saveItems(events);
    return Promise.resolve();
  }

  public findAll(): Promise<DomainEvent[]> {
    return Promise.resolve(this.getItems());
  }
}

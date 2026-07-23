export interface EventRepository {
  save(event: import('./event.schema').DomainEvent): Promise<void>;
  findAll(): Promise<import('./event.schema').DomainEvent[]>;
  /** Data do evento migration.completed mais recente do workspace, ou null se nunca migrou. */
  findMigrationCompletedAt(): Promise<string | null>;
}

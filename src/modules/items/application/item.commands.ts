import { ItemRepository } from './item.repository';
import { EventRepository } from '@/platform/events/event.repository';
import { CreateItemDTO, Item, ItemSchema, UpdateItemDTO } from '../domain/item.schema';

export class ItemCommands {
  constructor(
    private itemRepo: ItemRepository,
    private eventRepo: EventRepository
  ) {}

  async createItem(dto: CreateItemDTO, workspaceId: string): Promise<Item> {
    const item: Item = {
      id: crypto.randomUUID(),
      workspaceId,
      title: dto.title,
      content: dto.content,
      type: dto.type || 'note',
      status: 'inbox', // Default inicial caso não organizado
      priority: dto.priority || 'normal',
      projectId: dto.projectId,
      dueAt: dto.dueAt,
      scheduledAt: dto.scheduledAt,
      estimatedMinutes: dto.estimatedMinutes,
      nextAction: dto.nextAction,
      source: dto.source || 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 1. Validar
    ItemSchema.parse(item);

    // 2. Persistir no repositório
    await this.itemRepo.save(item);

    // 3. Registrar evento
    // Futuro Supabase: persistência transacional
    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'item.created',
      entityId: item.id,
      workspaceId,
      source: item.source,
      payload: item,
      createdAt: new Date().toISOString(),
    });

    return item;
  }

  async updateItem(id: string, dto: UpdateItemDTO): Promise<Item> {
    const existing = await this.itemRepo.findById(id);
    if (!existing) throw new Error("Item não encontrado");

    const updated: Item = {
      ...existing,
      ...dto,
      updatedAt: new Date().toISOString()
    };

    ItemSchema.parse(updated);
    await this.itemRepo.save(updated);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'item.updated',
      entityId: updated.id,
      workspaceId: updated.workspaceId,
      source: 'manual',
      payload: { previous: existing, new: updated },
      createdAt: new Date().toISOString(),
    });

    return updated;
  }

  async scheduleItem(id: string, scheduledAt: string): Promise<Item> {
    const existing = await this.itemRepo.findById(id);
    if (!existing) throw new Error("Item não encontrado");

    const previousScheduledAt = existing.scheduledAt;
    
    const updated: Item = {
      ...existing,
      scheduledAt,
      updatedAt: new Date().toISOString()
    };

    ItemSchema.parse(updated);
    await this.itemRepo.save(updated);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'item.scheduled',
      entityId: updated.id,
      workspaceId: updated.workspaceId,
      source: 'manual',
      payload: { previousScheduledAt, newScheduledAt: scheduledAt },
      createdAt: new Date().toISOString(),
    });

    return updated;
  }

  async completeItem(id: string): Promise<Item> {
    const existing = await this.itemRepo.findById(id);
    if (!existing) throw new Error("Item não encontrado");

    const updated: Item = {
      ...existing,
      status: 'completed',
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    ItemSchema.parse(updated);
    await this.itemRepo.save(updated);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'item.completed',
      entityId: updated.id,
      workspaceId: updated.workspaceId,
      source: 'manual',
      payload: updated,
      createdAt: new Date().toISOString(),
    });

    return updated;
  }

  async archiveItem(id: string): Promise<Item> {
    const existing = await this.itemRepo.findById(id);
    if (!existing) throw new Error("Item não encontrado");

    const updated: Item = {
      ...existing,
      status: 'archived',
      archivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    ItemSchema.parse(updated);
    await this.itemRepo.save(updated);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'item.archived',
      entityId: updated.id,
      workspaceId: updated.workspaceId,
      source: 'manual',
      payload: updated,
      createdAt: new Date().toISOString(),
    });

    return updated;
  }

  /** Reabre um item concluído: volta para 'organized' (processado, não concluído). */
  async reopenItem(id: string): Promise<Item> {
    const existing = await this.itemRepo.findById(id);
    if (!existing) throw new Error("Item não encontrado");

    const updated: Item = {
      ...existing,
      status: 'organized',
      completedAt: undefined,
      updatedAt: new Date().toISOString()
    };

    ItemSchema.parse(updated);
    await this.itemRepo.save(updated);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'item.updated',
      entityId: updated.id,
      workspaceId: updated.workspaceId,
      source: 'manual',
      payload: { previous: existing, new: updated },
      createdAt: new Date().toISOString(),
    });

    return updated;
  }

  /** Desarquiva um item: volta para 'organized' (processado, não arquivado). */
  async unarchiveItem(id: string): Promise<Item> {
    const existing = await this.itemRepo.findById(id);
    if (!existing) throw new Error("Item não encontrado");

    const updated: Item = {
      ...existing,
      status: 'organized',
      archivedAt: undefined,
      updatedAt: new Date().toISOString()
    };

    ItemSchema.parse(updated);
    await this.itemRepo.save(updated);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'item.updated',
      entityId: updated.id,
      workspaceId: updated.workspaceId,
      source: 'manual',
      payload: { previous: existing, new: updated },
      createdAt: new Date().toISOString(),
    });

    return updated;
  }
}

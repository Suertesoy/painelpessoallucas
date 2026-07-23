import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ItemCommands } from '@/modules/items/application/item.commands';
import { LocalStorageItemRepository } from '@/modules/items/infrastructure/local-storage-item.repository';
import { LocalStorageEventRepository } from '@/platform/events/local-storage-event.repository';
import { selectActiveTasks } from '@/lib/item-filters';
import type { Item } from '@/modules/items/domain/item.schema';

/**
 * Ciclo de vida completo de um item (concluir/reabrir, arquivar/desarquivar)
 * e a regra real de "Hoje → Próximas Ações" — sem chamadas reais ao Supabase
 * (repositórios em localStorage, mesmo padrão de src/test/domain.test.ts).
 */

describe('Ciclo de vida do item: concluir/reabrir, arquivar/desarquivar', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    const mockStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    };
    vi.stubGlobal('window', { localStorage: mockStorage, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('localStorage', mockStorage);
  });

  it('conclui e depois reabre, voltando para organized e limpando completedAt', async () => {
    const itemRepo = new LocalStorageItemRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new ItemCommands(itemRepo, eventRepo);

    const item = await commands.createItem({ title: 'baile da brum', type: 'task' }, 'ws-1');
    const completed = await commands.completeItem(item.id);
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBeDefined();

    const reopened = await commands.reopenItem(item.id);
    expect(reopened.status).toBe('organized');
    expect(reopened.completedAt).toBeUndefined();
  });

  it('reabertura registra item.updated (não inventa um novo tipo de evento)', async () => {
    const itemRepo = new LocalStorageItemRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new ItemCommands(itemRepo, eventRepo);

    const item = await commands.createItem({ title: 'Tarefa', type: 'task' }, 'ws-1');
    await commands.completeItem(item.id);
    await commands.reopenItem(item.id);

    const events = await eventRepo.findAll();
    const reopenEvents = events.filter((e) => e.entityId === item.id && e.type === 'item.updated');
    expect(reopenEvents.length).toBeGreaterThan(0);
  });

  it('arquiva e depois desarquiva, voltando para organized e limpando archivedAt', async () => {
    const itemRepo = new LocalStorageItemRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new ItemCommands(itemRepo, eventRepo);

    const item = await commands.createItem({ title: 'Item arquivável' }, 'ws-1');
    const archived = await commands.archiveItem(item.id);
    expect(archived.status).toBe('archived');
    expect(archived.archivedAt).toBeDefined();

    const unarchived = await commands.unarchiveItem(item.id);
    expect(unarchived.status).toBe('organized');
    expect(unarchived.archivedAt).toBeUndefined();
  });

  it('desarquivamento registra item.updated', async () => {
    const itemRepo = new LocalStorageItemRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new ItemCommands(itemRepo, eventRepo);

    const item = await commands.createItem({ title: 'Item' }, 'ws-1');
    await commands.archiveItem(item.id);
    await commands.unarchiveItem(item.id);

    const events = await eventRepo.findAll();
    const unarchiveEvents = events.filter((e) => e.entityId === item.id && e.type === 'item.updated');
    expect(unarchiveEvents.length).toBeGreaterThan(0);
  });

  it('associar a um projeto usa updateItem e persiste projectId', async () => {
    const itemRepo = new LocalStorageItemRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new ItemCommands(itemRepo, eventRepo);

    const item = await commands.createItem({ title: 'Item sem projeto' }, 'ws-1');
    const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const updated = await commands.updateItem(item.id, { projectId });
    expect(updated.projectId).toBe(projectId);
  });

  it('agendar e remover agendamento via updateItem', async () => {
    const itemRepo = new LocalStorageItemRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new ItemCommands(itemRepo, eventRepo);

    const item = await commands.createItem({ title: 'Item' }, 'ws-1');
    const scheduled = await commands.updateItem(item.id, { scheduledAt: '2026-08-01T10:00:00.000Z' });
    expect(scheduled.scheduledAt).toBe('2026-08-01T10:00:00.000Z');

    const unscheduled = await commands.updateItem(item.id, { scheduledAt: undefined });
    expect(unscheduled.scheduledAt).toBeUndefined();
  });

  it('definir e remover prazo via updateItem', async () => {
    const itemRepo = new LocalStorageItemRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new ItemCommands(itemRepo, eventRepo);

    const item = await commands.createItem({ title: 'Item' }, 'ws-1');
    const withDue = await commands.updateItem(item.id, { dueAt: '2026-08-05T00:00:00.000Z' });
    expect(withDue.dueAt).toBe('2026-08-05T00:00:00.000Z');

    const withoutDue = await commands.updateItem(item.id, { dueAt: undefined });
    expect(withoutDue.dueAt).toBeUndefined();
  });
});

describe('selectActiveTasks — regra de Hoje → Próximas Ações', () => {
  function task(overrides: Partial<Item>): Item {
    return {
      id: crypto.randomUUID(),
      workspaceId: 'ws-1',
      title: 'Tarefa',
      type: 'task',
      status: 'organized',
      priority: 'normal',
      source: 'manual',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('inclui tarefas abertas, mesmo sem prazo/agendamento/próxima ação', () => {
    const items = [task({ status: 'organized' })];
    expect(selectActiveTasks(items)).toHaveLength(1);
  });

  it('exclui tarefas concluídas', () => {
    const items = [task({ status: 'completed' })];
    expect(selectActiveTasks(items)).toHaveLength(0);
  });

  it('exclui tarefas arquivadas', () => {
    const items = [task({ status: 'archived' })];
    expect(selectActiveTasks(items)).toHaveLength(0);
  });

  it('exclui itens sem natureza de ação (ideias, referências, notas)', () => {
    const items = [
      task({ type: 'idea', status: 'organized' }),
      task({ type: 'reference', status: 'organized' }),
      task({ type: 'note', status: 'organized' }),
    ];
    expect(selectActiveTasks(items)).toHaveLength(0);
  });

  it('um item concluído desaparece da lista imediatamente após a mudança de status', () => {
    const item = task({ status: 'organized' });
    expect(selectActiveTasks([item])).toHaveLength(1);
    const completed = { ...item, status: 'completed' as const };
    expect(selectActiveTasks([completed])).toHaveLength(0);
  });

  it('um item arquivado desaparece da lista imediatamente após a mudança de status', () => {
    const item = task({ status: 'organized' });
    expect(selectActiveTasks([item])).toHaveLength(1);
    const archived = { ...item, status: 'archived' as const };
    expect(selectActiveTasks([archived])).toHaveLength(0);
  });
});

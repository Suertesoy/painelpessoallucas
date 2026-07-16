import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DailyPlanCommands } from '@/modules/planning/application/daily-plan.commands';
import { ItemCommands } from '@/modules/items/application/item.commands';
import { LocalStorageDailyPlanRepository } from '@/modules/planning/infrastructure/local-storage-daily-plan.repository';
import { LocalStorageEventRepository } from '@/platform/events/local-storage-event.repository';
import { LocalStorageItemRepository } from '@/modules/items/infrastructure/local-storage-item.repository';
import { LocalStorageProjectRepository } from '@/modules/projects/infrastructure/local-storage-project.repository';



describe('Domain Rules & Adapters Validation', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    const mockStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); }
    };
    
    vi.stubGlobal('window', { localStorage: mockStorage, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('localStorage', mockStorage);
  });

  it('1. Limite máximo de três itens no foco diário', async () => {
    const dailyPlanRepo = new LocalStorageDailyPlanRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new DailyPlanCommands(dailyPlanRepo, eventRepo);

    const id1 = '123e4567-e89b-12d3-a456-426614174001';
    const id2 = '123e4567-e89b-12d3-a456-426614174002';
    const id3 = '123e4567-e89b-12d3-a456-426614174003';
    const id4 = '123e4567-e89b-12d3-a456-426614174004';

    await expect(
      commands.setDailyFocus('ws-1', '2026-07-16', [id1, id2, id3, id4])
    ).rejects.toThrow("No máximo 3 itens permitidos no foco diário");

    const plan = await commands.setDailyFocus('ws-1', '2026-07-16', [id1, id2]);
    expect(plan.focusItemIds.length).toBe(2);
  });

  it('2. Persistência do DailyPlan', async () => {
    const dailyPlanRepo = new LocalStorageDailyPlanRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new DailyPlanCommands(dailyPlanRepo, eventRepo);

    const id1 = '123e4567-e89b-12d3-a456-426614174001';
    await commands.setDailyFocus('ws-1', '2026-07-16', [id1]);
    const saved = await dailyPlanRepo.findByDate('2026-07-16');
    expect(saved?.focusItemIds).toContain(id1);
  });

  it('3. Reatividade após criação e atualização', async () => {
    const itemRepo = new LocalStorageItemRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new ItemCommands(itemRepo, eventRepo);
    
    let notified = 0;
    const unsubscribe = itemRepo.subscribe(() => notified++);

    await commands.createItem({ title: 'Test reactivity' }, 'ws-1');
    expect(notified).toBe(1);

    unsubscribe();
  });

  it('4. Evento item.scheduled com valor anterior e novo', async () => {
    const itemRepo = new LocalStorageItemRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new ItemCommands(itemRepo, eventRepo);

    const item = await commands.createItem({ title: 'Task to schedule' }, 'ws-1');
    await commands.scheduleItem(item.id, '2026-07-17T10:00:00Z');

    const events = await eventRepo.findAll();
    const scheduleEvent = events.find(e => e.type === 'item.scheduled');
    
    expect(scheduleEvent).toBeDefined();
    expect(scheduleEvent?.payload.previousScheduledAt).toBeUndefined();
    expect(scheduleEvent?.payload.newScheduledAt).toBe('2026-07-17T10:00:00Z');
  });

  it('5. Ausência segura de window durante execução no servidor', async () => {
    // Simulando ambiente Node onde window é undefined
    const originalWindow = global.window;
    // @ts-expect-error node env simulation
    delete global.window; 

    // Deve instanciar sem quebrar
    const repo = new LocalStorageItemRepository();
    // Deve retornar vazio e não quebrar
    const items = await repo.findAll();
    expect(items).toEqual([]);

    // Restaura window
    global.window = originalWindow;
  });

  it('6. Pesquisa por nome do projeto', async () => {
    const projectRepo = new LocalStorageProjectRepository();
    // Preenche mock storage
    projectRepo.save({
      id: 'p1', workspaceId: 'ws', name: 'Alpha', status: 'active', attentionLevel: 'normal', createdAt: '', updatedAt: ''
    } as unknown as import('@/modules/projects/domain/project.schema').Project);

    const projects = await projectRepo.findAll();
    const result = projects.filter(p => p.name.includes('Alpha'));
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Alpha');
  });

  it('7. Recuperação dos dados após nova instanciação do adaptador local', async () => {
    const repo1 = new LocalStorageItemRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new ItemCommands(repo1, eventRepo);
    await commands.createItem({ title: 'Recovery item' }, 'ws-1');

    // Nova instância simulando refresh da página ou uso em outro componente desacoplado
    const repo2 = new LocalStorageItemRepository();
    const items = await repo2.findAll();
    expect(items.length).toBe(1);
    expect(items[0].title).toBe('Recovery item');
  });
});

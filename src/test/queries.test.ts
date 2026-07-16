import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ItemQueries } from '../modules/items/application/item.queries';
import { ProjectQueries } from '../modules/projects/application/project.queries';
import { GlobalQueries } from '../modules/global/application/global.queries';
import { LocalStorageItemRepository } from '../modules/items/infrastructure/local-storage-item.repository';
import { LocalStorageProjectRepository } from '../modules/projects/infrastructure/local-storage-project.repository';
import { Item } from '../modules/items/domain/item.schema';
import { Project } from '../modules/projects/domain/project.schema';

describe('Queries Layer', () => {
  let itemRepo: LocalStorageItemRepository;
  let projectRepo: LocalStorageProjectRepository;
  let itemQueries: ItemQueries;
  let projectQueries: ProjectQueries;
  let globalQueries: GlobalQueries;

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

    localStorage.clear();
    itemRepo = new LocalStorageItemRepository();
    projectRepo = new LocalStorageProjectRepository();
    itemQueries = new ItemQueries(itemRepo);
    projectQueries = new ProjectQueries(projectRepo);
    globalQueries = new GlobalQueries(itemQueries, projectQueries);
  });

  it('should list inbox items correctly', async () => {
    const item1: Item = {
      id: '1', workspaceId: 'ws-1', title: 'Task 1', content: '',
      type: 'task', priority: 'normal', status: 'in_progress', source: 'manual',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    const item2: Item = {
      id: '2', workspaceId: 'ws-1', title: 'Note 1', content: '',
      type: 'note', priority: 'normal', status: 'inbox', source: 'manual',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    
    await itemRepo.save(item1);
    await itemRepo.save(item2);

    const inboxItems = await itemQueries.listInboxItems();
    expect(inboxItems.length).toBe(1);
    expect(inboxItems[0].id).toBe('2');
  });

  it('should get project by id', async () => {
    const p: Project = {
      id: 'p1', workspaceId: 'ws-1', name: 'My Project',
      status: 'active', attentionLevel: 'normal',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    await projectRepo.save(p);

    const found = await projectQueries.getProjectById('p1');
    expect(found).toBeDefined();
    expect(found?.name).toBe('My Project');

    const notFound = await projectQueries.getProjectById('missing');
    expect(notFound).toBeNull();
  });

  it('should perform global search combining items and projects', async () => {
    const p: Project = {
      id: 'p1', workspaceId: 'ws-1', name: 'Reforma da Casa',
      status: 'active', attentionLevel: 'normal',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    const i: Item = {
      id: '1', workspaceId: 'ws-1', title: 'Comprar tinta', content: 'Cor azul para reforma',
      type: 'task', priority: 'normal', status: 'in_progress', source: 'manual',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    
    await projectRepo.save(p);
    await itemRepo.save(i);

    const results = await globalQueries.globalSearch('Reforma');
    expect(results.length).toBe(2);
    
    const types = results.map(r => r.type);
    expect(types).toContain('project');
    expect(types).toContain('item');
  });
});

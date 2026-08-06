import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectCommands } from '@/modules/projects/application/project.commands';
import { ProjectQueries } from '@/modules/projects/application/project.queries';
import { LocalStorageProjectRepository } from '@/modules/projects/infrastructure/local-storage-project.repository';
import { LocalStorageEventRepository } from '@/platform/events/local-storage-event.repository';

/**
 * Ciclo de vida de projeto: seleção de "assignable" (só active), arquivar
 * (agora setando archivedAt), restaurar (nova command) e a guarda do
 * cliente para exclusão permanente — sem chamadas reais ao Supabase
 * (repositório em localStorage, mesmo padrão de item-lifecycle.test.ts). O
 * comportamento real da RPC transacional é coberto separadamente em
 * project-hard-delete-rpc.test.ts.
 */

function setupLocalStorage() {
  const store: Record<string, string> = {};
  const mockStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
  vi.stubGlobal('window', { localStorage: mockStorage, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('localStorage', mockStorage);
}

describe('ProjectQueries.listAssignableProjects', () => {
  beforeEach(setupLocalStorage);

  it('retorna somente projetos com status active', async () => {
    const projectRepo = new LocalStorageProjectRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new ProjectCommands(projectRepo, eventRepo);
    const queries = new ProjectQueries(projectRepo);

    const active = await commands.createProject({ name: 'Ativo', status: 'active' }, 'ws-1');
    await commands.createProject({ name: 'Pausado', status: 'paused' }, 'ws-1');
    await commands.createProject({ name: 'Concluído', status: 'completed' }, 'ws-1');
    const toArchive = await commands.createProject({ name: 'Vai arquivar', status: 'active' }, 'ws-1');
    await commands.archiveProject(toArchive.id);

    const assignable = await queries.listAssignableProjects();

    expect(assignable.map((p) => p.id)).toEqual([active.id]);
  });
});

describe('ProjectCommands.archiveProject', () => {
  beforeEach(setupLocalStorage);

  it('seta status archived E archivedAt (não só status)', async () => {
    const projectRepo = new LocalStorageProjectRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new ProjectCommands(projectRepo, eventRepo);

    const project = await commands.createProject({ name: 'Teste nuvem', status: 'active' }, 'ws-1');
    expect(project.archivedAt).toBeUndefined();

    const archived = await commands.archiveProject(project.id);

    expect(archived.status).toBe('archived');
    expect(archived.archivedAt).toBeDefined();
  });

  it('emite project.archived', async () => {
    const projectRepo = new LocalStorageProjectRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new ProjectCommands(projectRepo, eventRepo);

    const project = await commands.createProject({ name: 'Projeto', status: 'active' }, 'ws-1');
    await commands.archiveProject(project.id);

    const events = await eventRepo.findAll();
    expect(events.some((e) => e.entityId === project.id && e.type === 'project.archived')).toBe(true);
  });
});

describe('ProjectCommands.restoreProject', () => {
  beforeEach(setupLocalStorage);

  it('volta status para active e limpa archivedAt', async () => {
    const projectRepo = new LocalStorageProjectRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new ProjectCommands(projectRepo, eventRepo);

    const project = await commands.createProject({ name: 'Projeto', status: 'active' }, 'ws-1');
    await commands.archiveProject(project.id);

    const restored = await commands.restoreProject(project.id);

    expect(restored.status).toBe('active');
    expect(restored.archivedAt).toBeUndefined();
  });

  it('rejeita restaurar um projeto que não está arquivado', async () => {
    const projectRepo = new LocalStorageProjectRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new ProjectCommands(projectRepo, eventRepo);

    const project = await commands.createProject({ name: 'Projeto', status: 'active' }, 'ws-1');

    await expect(commands.restoreProject(project.id)).rejects.toThrow(/arquivado/);
  });

  it('emite project.restored', async () => {
    const projectRepo = new LocalStorageProjectRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new ProjectCommands(projectRepo, eventRepo);

    const project = await commands.createProject({ name: 'Projeto', status: 'active' }, 'ws-1');
    await commands.archiveProject(project.id);
    await commands.restoreProject(project.id);

    const events = await eventRepo.findAll();
    expect(events.some((e) => e.entityId === project.id && e.type === 'project.restored')).toBe(true);
  });
});

describe('ProjectCommands.deleteProjectPermanently — guarda no cliente', () => {
  beforeEach(setupLocalStorage);

  it('rejeita excluir um projeto que não está arquivado, sem chamar o repositório', async () => {
    const projectRepo = new LocalStorageProjectRepository();
    const deleteSpy = vi.spyOn(projectRepo, 'deletePermanently');
    const eventRepo = new LocalStorageEventRepository();
    const commands = new ProjectCommands(projectRepo, eventRepo);

    const project = await commands.createProject({ name: 'Projeto ativo', status: 'active' }, 'ws-1');

    await expect(commands.deleteProjectPermanently(project.id)).rejects.toThrow(/arquivado/);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('projeto arquivado: chama deletePermanently do repositório', async () => {
    const projectRepo = new LocalStorageProjectRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new ProjectCommands(projectRepo, eventRepo);

    const project = await commands.createProject({ name: 'Projeto', status: 'active' }, 'ws-1');
    await commands.archiveProject(project.id);
    await commands.deleteProjectPermanently(project.id);

    const remaining = await projectRepo.findAll();
    expect(remaining.some((p) => p.id === project.id)).toBe(false);
  });
});

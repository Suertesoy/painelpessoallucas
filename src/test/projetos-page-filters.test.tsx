// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { Project } from '@/modules/projects/domain/project.schema';

/**
 * Testes de comportamento real da página Projetos: filtro inicial, opção
 * "Todos", contagem antes/depois do filtro, e que uma nova instância do
 * componente (ex.: outra aba/dispositivo) carrega os mesmos dados a partir
 * da mesma fonte — sem chamadas reais ao Supabase (projectQueries é mockado).
 */

const fakeRepo = { subscribe: () => () => {} };

function makeProject(overrides: Partial<Project>): Project {
  return {
    id: crypto.randomUUID(),
    workspaceId: 'ws-1',
    name: 'Projeto',
    status: 'active',
    attentionLevel: 'normal',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const sevenProjects: Project[] = [
  makeProject({ name: 'Ativo 1', status: 'active' }),
  makeProject({ name: 'Ativo 2', status: 'active' }),
  makeProject({ name: 'Ativo 3', status: 'active' }),
  makeProject({ name: 'Ativo 4', status: 'active' }),
  makeProject({ name: 'Ativo 5', status: 'active' }),
  makeProject({ name: 'Pausado 1', status: 'paused' }),
  makeProject({ name: 'Arquivado 1', status: 'archived' }),
];

const listProjects = vi.fn().mockResolvedValue(sevenProjects);
const listItems = vi.fn().mockResolvedValue([]);
const createProject = vi.fn();

vi.mock('@/providers/repository.provider', () => ({
  useRepositories: () => ({
    itemRepository: fakeRepo,
    projectRepository: fakeRepo,
    dailyPlanRepository: fakeRepo,
  }),
  useQueries: () => ({
    project: { listProjects },
    item: { listItems },
  }),
  useCommands: () => ({
    project: { createProject },
  }),
}));

vi.mock('@/providers/auth.provider', () => ({
  useWorkspace: () => ({ workspaceId: 'ws-1' }),
}));

afterEach(() => {
  cleanup();
});

describe('ProjetosPage — filtros', () => {
  it('sete projetos são retornados pela query e o filtro inicial (Ativos) mostra só os 5 ativos', async () => {
    const { default: ProjetosPage } = await import('@/app/projetos/page');
    render(<ProjetosPage />);

    await waitFor(() => expect(screen.getByText('Ativo 1')).toBeTruthy());
    expect(listProjects).toHaveBeenCalled();
    expect(screen.getAllByText(/^Ativo \d$/)).toHaveLength(5);
    expect(screen.queryByText('Pausado 1')).toBeNull();
    expect(screen.queryByText('Arquivado 1')).toBeNull();
  });

  it('filtro "Todos" mostra os sete projetos, de qualquer status', async () => {
    const { default: ProjetosPage } = await import('@/app/projetos/page');
    render(<ProjetosPage />);

    await waitFor(() => expect(screen.getByText('Ativo 1')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));

    await waitFor(() => expect(screen.getByText('Pausado 1')).toBeTruthy());
    expect(screen.getByText('Arquivado 1')).toBeTruthy();
    expect(screen.getAllByText(/^Ativo \d$/)).toHaveLength(5);
  });

  it('filtro sem correspondência mostra mensagem específica, não "consulta falhou"', async () => {
    const { default: ProjetosPage } = await import('@/app/projetos/page');
    render(<ProjetosPage />);

    await waitFor(() => expect(screen.getByText('Ativo 1')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Concluídos' }));

    await waitFor(() =>
      expect(screen.getByText('Nenhum projeto corresponde a este filtro.')).toBeTruthy()
    );
  });

  it('uma nova instância do componente carrega os mesmos dados da mesma fonte', async () => {
    const { default: ProjetosPage } = await import('@/app/projetos/page');

    const first = render(<ProjetosPage />);
    await waitFor(() => expect(screen.getByText('Ativo 1')).toBeTruthy());
    first.unmount();

    render(<ProjetosPage />);
    await waitFor(() => expect(screen.getByText('Ativo 1')).toBeTruthy());
    expect(screen.getAllByText(/^Ativo \d$/)).toHaveLength(5);
  });
});

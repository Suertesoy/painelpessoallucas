// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Suspense } from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import type { Project } from '@/modules/projects/domain/project.schema';

/**
 * /projetos/[projectId] — botão "Arquivar" some quando o projeto já está
 * arquivado; "Restaurar"/"Excluir permanentemente" só aparecem nesse estado;
 * exclusão exige o diálogo forte (digitar o nome exato) antes de habilitar o
 * botão final; sucesso redireciona para a lista com o filtro Arquivados.
 */

function makeProject(overrides: Partial<Project>): Project {
  return {
    id: 'proj-1',
    workspaceId: 'ws-1',
    name: 'Teste nuvem',
    status: 'active',
    attentionLevel: 'normal',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const getProjectById = vi.fn();
const listItems = vi.fn().mockResolvedValue([]);
const updateProject = vi.fn();
const archiveProject = vi.fn();
const restoreProject = vi.fn();
const deleteProjectPermanently = vi.fn();
const routerPush = vi.fn();

const fakeRepo = { subscribe: () => () => {} };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/providers/repository.provider', () => ({
  useRepositories: () => ({
    itemRepository: fakeRepo,
    projectRepository: fakeRepo,
    dailyPlanRepository: fakeRepo,
    calendarEventLinkRepository: fakeRepo,
    learningContentRepository: fakeRepo,
    studySessionRepository: fakeRepo,
    lessonProgressRepository: fakeRepo,
    shoppingListRepository: fakeRepo,
  }),
  useQueries: () => ({
    project: { getProjectById },
    item: { listItems },
  }),
  useCommands: () => ({
    project: { updateProject, archiveProject, restoreProject, deleteProjectPermanently },
    item: {},
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  listItems.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
});

async function renderDetail(project: Project) {
  getProjectById.mockResolvedValue(project);
  const { default: ProjetoDetalhePage } = await import('@/app/projetos/[projectId]/page');
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <ProjetoDetalhePage params={Promise.resolve({ projectId: project.id })} />
      </Suspense>
    );
  });
  await waitFor(() => expect(screen.getByLabelText('Nome do projeto')).toHaveProperty('value', project.name));
}

describe('/projetos/[projectId] — ações de ciclo de vida', () => {
  it('projeto ativo: mostra "Arquivar", não mostra Restaurar/Excluir', async () => {
    await renderDetail(makeProject({ status: 'active' }));

    expect(screen.getByLabelText('Arquivar projeto')).toBeTruthy();
    expect(screen.queryByLabelText('Restaurar projeto')).toBeNull();
    expect(screen.queryByLabelText('Excluir projeto permanentemente')).toBeNull();
  });

  it('projeto arquivado: não mostra "Arquivar", mostra Restaurar e Excluir', async () => {
    await renderDetail(makeProject({ status: 'archived', archivedAt: '2026-02-01T00:00:00.000Z' }));

    expect(screen.queryByLabelText('Arquivar projeto')).toBeNull();
    expect(screen.getByLabelText('Restaurar projeto')).toBeTruthy();
    expect(screen.getByLabelText('Excluir projeto permanentemente')).toBeTruthy();
  });

  it('clicar em Restaurar chama restoreProject', async () => {
    await renderDetail(makeProject({ status: 'archived' }));

    fireEvent.click(screen.getByLabelText('Restaurar projeto'));

    await waitFor(() => expect(restoreProject).toHaveBeenCalledWith('proj-1'));
  });

  it('diálogo de exclusão só habilita o botão final quando o nome digitado bate exatamente', async () => {
    await renderDetail(makeProject({ status: 'archived', name: 'Teste nuvem' }));

    fireEvent.click(screen.getByLabelText('Excluir projeto permanentemente'));
    const confirmButton = (await screen.findByRole('button', { name: 'Excluir permanentemente' })) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    const input = screen.getByLabelText(/Digite/);
    fireEvent.change(input, { target: { value: 'nome errado' } });
    expect(confirmButton.disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'Teste nuvem' } });
    expect(confirmButton.disabled).toBe(false);
  });

  it('confirmar exclusão chama deleteProjectPermanently e redireciona para ?filter=archived', async () => {
    deleteProjectPermanently.mockResolvedValue(undefined);
    await renderDetail(makeProject({ status: 'archived', name: 'Teste nuvem' }));

    fireEvent.click(screen.getByLabelText('Excluir projeto permanentemente'));
    fireEvent.change(screen.getByLabelText(/Digite/), { target: { value: 'Teste nuvem' } });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir permanentemente' }));

    await waitFor(() => expect(deleteProjectPermanently).toHaveBeenCalledWith('proj-1'));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/projetos?filter=archived'));
  });
});

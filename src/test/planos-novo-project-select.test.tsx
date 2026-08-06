// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import type { Project } from '@/modules/projects/domain/project.schema';

/**
 * /planos/novo já filtrava corretamente para status active antes desta
 * entrega (era o único select que fazia isso certo) — este teste fixa esse
 * comportamento como regressão, agora usando a regra compartilhada
 * `listAssignableProjects` em vez de um `.filter()` manual só nesta tela.
 */

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

const assignableProjects: Project[] = [makeProject({ name: 'Almeida Ambiental', status: 'active' })];

const listAssignableProjects = vi.fn().mockResolvedValue(assignableProjects);
const fakeRepo = { subscribe: () => () => {} };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
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
    project: { listAssignableProjects },
  }),
  useCommands: () => ({
    plan: { createSourceDocument: vi.fn() },
    project: { createProject: vi.fn() },
  }),
}));

vi.mock('@/providers/auth.provider', () => ({
  useWorkspace: () => ({ workspaceId: 'ws-1' }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('/planos/novo — select de projeto existente', () => {
  it('usa listAssignableProjects (só projetos ativos) para as opções do select', async () => {
    const { default: NovoPlanoPage } = await import('@/app/planos/novo/page');
    render(<NovoPlanoPage />);

    await waitFor(() => expect(listAssignableProjects).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('option', { name: 'Almeida Ambiental' })).toBeTruthy());

    // Nunca chama listProjects() cru — a regra de elegibilidade é sempre a
    // mesma, centralizada em listAssignableProjects.
    const select = screen.getByLabelText('Projeto existente') as HTMLSelectElement;
    expect(select.options.length).toBe(2); // "— Selecionar —" + 1 projeto ativo
  });
});

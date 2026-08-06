// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Suspense } from 'react';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import RevisarPlanoPage from '@/app/planos/[planId]/revisar/page';
import type { PlanDetail } from '@/modules/plans/domain/plan.schema';
import type { Project } from '@/modules/projects/domain/project.schema';

/**
 * Causa raiz do bug real: o select de projeto de cada PlanAction, em
 * /planos/[planId]/revisar, usava a lista crua de projetos (listProjects,
 * sem filtro) — por isso projetos de teste já arquivados ("Teste nuvem",
 * "Teste nuvem 2") apareciam como opção de NOVA atribuição, ao contrário de
 * /planos/novo, que já filtrava para status active. Este teste fixa a
 * correção: novas opções vêm só de listAssignableProjects; um projeto já
 * atribuído (specific) que não é mais assignable continua aparecendo,
 * sozinho, como opção histórica — nunca "projeto desconhecido".
 */

const PLAN_ID = 'plan-1';
const WORKSPACE_ID = 'ws-1';
const now = '2026-08-01T00:00:00.000Z';

function makeProject(overrides: Partial<Project>): Project {
  return {
    id: crypto.randomUUID(),
    workspaceId: WORKSPACE_ID,
    name: 'Projeto',
    status: 'active',
    attentionLevel: 'normal',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const activeProject = makeProject({ id: 'proj-active', name: 'Almeida Ambiental', status: 'active' });
const archivedAssignedProject = makeProject({ id: 'proj-archived', name: 'Teste nuvem', status: 'archived' });
const archivedUnassignedProject = makeProject({ id: 'proj-archived-2', name: 'Teste nuvem 2', status: 'archived' });

const detail: PlanDetail = {
  plan: {
    id: PLAN_ID,
    workspaceId: WORKSPACE_ID,
    name: 'Plano de teste',
    status: 'draft',
    timezone: 'America/Sao_Paulo',
    createdAt: now,
    updatedAt: now,
  },
  phases: [],
  actions: [
    {
      id: 'action-1',
      workspaceId: WORKSPACE_ID,
      executionPlanId: PLAN_ID,
      title: 'Ação já atribuída a projeto arquivado',
      actionType: 'task',
      priority: 'normal',
      dependencyActionIds: [],
      requiresConfirmation: false,
      position: 0,
      createdAt: now,
      updatedAt: now,
      projectAssignment: 'specific',
      projectId: archivedAssignedProject.id,
    },
  ],
  recurrenceRules: [],
};

const getPlanDetail = vi.fn().mockResolvedValue(detail);
const getPlanProposal = vi.fn().mockResolvedValue(null);
const listProjects = vi.fn().mockResolvedValue([activeProject, archivedAssignedProject, archivedUnassignedProject]);
const listAssignableProjects = vi.fn().mockResolvedValue([activeProject]);
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
    plan: { getPlanDetail, getPlanProposal },
    project: { listProjects, listAssignableProjects },
  }),
  useCommands: () => ({
    plan: {
      updatePlan: vi.fn(),
      savePhases: vi.fn(),
      saveActions: vi.fn(),
      saveRecurrenceRules: vi.fn(),
      deleteAction: vi.fn(),
      deleteRecurrenceRule: vi.fn(),
      approvePlan: vi.fn(),
    },
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Tela de revisão — select de projeto por PlanAction usa apenas projetos assignable para novas opções', () => {
  it('mostra o projeto arquivado já atribuído como opção histórica, mas oferece só projetos ativos para nova atribuição', async () => {
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <RevisarPlanoPage params={Promise.resolve({ planId: PLAN_ID })} />
        </Suspense>
      );
    });

    await waitFor(() => expect(screen.getByLabelText('Projeto de "Ação já atribuída a projeto arquivado"')).toBeTruthy());
    const select = screen.getByLabelText('Projeto de "Ação já atribuída a projeto arquivado"') as HTMLSelectElement;

    // Opção histórica do projeto já atribuído (arquivado) continua visível e selecionada.
    expect(select.value).toBe(`specific:${archivedAssignedProject.id}`);
    expect(screen.getByText(/Teste nuvem \(já atribuído — não ativo\)/)).toBeTruthy();

    // O outro projeto arquivado (nunca atribuído a esta ação) NUNCA aparece como opção nova.
    expect(screen.queryByText('Teste nuvem 2')).toBeNull();

    // O projeto ativo aparece normalmente como opção de nova atribuição.
    expect(screen.getByRole('option', { name: 'Almeida Ambiental' })).toBeTruthy();
  });
});

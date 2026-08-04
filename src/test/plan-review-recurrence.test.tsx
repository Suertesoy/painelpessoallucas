// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Suspense } from 'react';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import RevisarPlanoPage from '@/app/planos/[planId]/revisar/page';
import type { PlanDetail } from '@/modules/plans/domain/plan.schema';

/**
 * Caso real do bug: a tela de revisão mostrava "Estudo de japonês" na lista
 * de ações e, mais abaixo, "Diária às 18:00 (seg, ter, qua, qui, sex)" numa
 * seção solta — sem nenhuma ligação visual entre os dois, obrigando o
 * revisor a relacionar mentalmente qual regra pertence a qual atividade.
 * Este teste garante que a tela resolve o nome da ação a partir de
 * `recurrenceRuleId` e apresenta "atividade + frequência + horário" como uma
 * unidade só, dentro do card da própria ação.
 */

const PLAN_ID = 'plan-1';
const RULE_ID = 'rule-1';
const WORKSPACE_ID = 'ws-1';
const now = '2026-08-01T00:00:00.000Z';

const detail: PlanDetail = {
  plan: {
    id: PLAN_ID,
    workspaceId: WORKSPACE_ID,
    name: 'Plano de Execução Novo Site Grupo Almeida',
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
      title: 'Estudo de japonês',
      actionType: 'routine',
      priority: 'normal',
      estimatedMinutes: 30,
      recurrenceRuleId: RULE_ID,
      dependencyActionIds: [],
      requiresConfirmation: false,
      position: 0,
      createdAt: now,
      updatedAt: now,
      projectAssignment: 'inherit',
    },
  ],
  recurrenceRules: [
    {
      id: RULE_ID,
      workspaceId: WORKSPACE_ID,
      executionPlanId: PLAN_ID,
      frequency: 'daily',
      interval: 1,
      daysOfWeek: [1, 2, 3, 4, 5],
      localTime: '18:00',
      timezone: 'America/Sao_Paulo',
      isActive: false,
      createdAt: now,
      updatedAt: now,
    },
  ],
};

const getPlanDetail = vi.fn();
const getPlanProposal = vi.fn();
const listProjects = vi.fn().mockResolvedValue([]);
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
    financeRepository: fakeRepo,
  }),
  useQueries: () => ({
    plan: { getPlanDetail, getPlanProposal },
    project: { listProjects },
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

describe('Tela de revisão — recorrência associada à ação', () => {
  it('mostra "atividade + frequência + horário" como uma unidade, sem duplicar em seção solta', async () => {
    getPlanDetail.mockResolvedValue(detail);
    getPlanProposal.mockResolvedValue(null);

    await act(async () => {
      render(
        <Suspense fallback={null}>
          <RevisarPlanoPage params={Promise.resolve({ planId: PLAN_ID })} />
        </Suspense>
      );
    });

    await waitFor(() => expect(screen.getByDisplayValue('Estudo de japonês')).toBeTruthy());

    // O rótulo humano da recorrência aparece associado à ação.
    expect(screen.getByText('De segunda a sexta, às 18:00')).toBeTruthy();

    // Nunca mais o texto incorreto (aprovação não ativa recorrência).
    expect(screen.queryByText(/ativada somente após aprovação/i)).toBeNull();
    expect(screen.getAllByText(/Será ativada quando o plano for ativado\./i).length).toBeGreaterThan(0);

    // Sem regra órfã: a única recorrência já está vinculada à ação, então a
    // seção "Outras recorrências propostas" não deve aparecer.
    expect(screen.queryByText('Outras recorrências propostas')).toBeNull();
  });
});

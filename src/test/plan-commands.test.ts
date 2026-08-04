import { describe, it, expect } from 'vitest';
import { PlanCommands } from '@/modules/plans/application/plan.commands';
import type {
  SourceDocumentRepository,
  ExecutionPlanRepository,
} from '@/modules/plans/application/plan.repository';
import type { EventRepository } from '@/platform/events/event.repository';
import type { DomainEvent } from '@/platform/events/event.schema';
import type {
  SourceDocument,
  ExecutionPlan,
  PlanAction,
  PlanDetail,
} from '@/modules/plans/domain/plan.schema';
import type { PlanProposal } from '@/modules/plans/domain/plan-proposal.schema';

/**
 * PlanCommands.saveActions/savePhases/saveRecurrenceRules devem validar com
 * Zod antes de persistir — mesma assimetria leitura/escrita que permitiu o
 * ZodError em produção (actionRowToDomain validava na leitura; a escrita não
 * validava nada). Repositório fake em memória, sem Supabase.
 */

class FakePlanRepository implements ExecutionPlanRepository {
  plans = new Map<string, ExecutionPlan>();
  actions = new Map<string, PlanAction>();
  async savePlan(plan: ExecutionPlan): Promise<void> {
    this.plans.set(plan.id, plan);
  }
  async savePhases(): Promise<void> {}
  async saveActions(actions: PlanAction[]): Promise<void> {
    actions.forEach((a) => this.actions.set(a.id, a));
  }
  async saveRecurrenceRules(): Promise<void> {}
  async deletePhase(): Promise<void> {}
  async deleteAction(): Promise<void> {}
  async deleteRecurrenceRule(): Promise<void> {}
  async findPlanById(id: string): Promise<ExecutionPlan | null> {
    return this.plans.get(id) ?? null;
  }
  async findAllPlans(): Promise<ExecutionPlan[]> {
    return [...this.plans.values()];
  }
  async findPlansByProject(): Promise<ExecutionPlan[]> {
    return [];
  }
  async findDetail(): Promise<PlanDetail | null> {
    return null;
  }
  async findLatestProposal(): Promise<PlanProposal | null> {
    return null;
  }
  subscribe(): () => void {
    return () => {};
  }
}

class FakeDocRepository implements SourceDocumentRepository {
  async save(): Promise<void> {}
  async findById(): Promise<SourceDocument | null> {
    return null;
  }
  async findAll(): Promise<SourceDocument[]> {
    return [];
  }
  subscribe(): () => void {
    return () => {};
  }
}

class FakeEventRepository implements EventRepository {
  events: DomainEvent[] = [];
  async save(event: DomainEvent): Promise<void> {
    this.events.push(event);
  }
  async findAll(): Promise<DomainEvent[]> {
    return this.events;
  }
  async findMigrationCompletedAt(): Promise<string | null> {
    return null;
  }
  async findByEntityId(): Promise<DomainEvent[]> {
    return [];
  }
}

const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
const PLAN_ID = '44444444-4444-4444-8444-444444444444';

function baseAction(overrides: Partial<PlanAction> = {}): PlanAction {
  const now = new Date().toISOString();
  return {
    id: '55555555-5555-4555-8555-555555555555',
    workspaceId: WORKSPACE_ID,
    executionPlanId: PLAN_ID,
    title: 'Ação',
    actionType: 'task',
    priority: 'normal',
    dependencyActionIds: [],
    requiresConfirmation: false,
    position: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('PlanCommands — validação Zod na escrita (não só na leitura)', () => {
  it('saveActions aceita uma ação com dueRule/scheduleRule válidos', async () => {
    const repo = new FakePlanRepository();
    const cmds = new PlanCommands(new FakeDocRepository(), repo, new FakeEventRepository());
    const action = baseAction({
      dueRule: { type: 'offset_from_phase', days: 4 },
      scheduleRule: { dateRule: { type: 'offset_from_start', days: 2 }, time: '10:00' },
    });

    await expect(cmds.saveActions([action])).resolves.toBeUndefined();
    expect(repo.actions.get(action.id)).toBeDefined();
  });

  it('saveActions rejeita dueRule com formato de data inválido antes de persistir', async () => {
    const repo = new FakePlanRepository();
    const cmds = new PlanCommands(new FakeDocRepository(), repo, new FakeEventRepository());
    const invalid = {
      ...baseAction(),
      dueRule: { type: 'fixed', date: 'Semana 2, sexta-feira' },
    } as unknown as PlanAction;

    await expect(cmds.saveActions([invalid])).rejects.toThrow();
    expect(repo.actions.size).toBe(0);
  });

  it('aprovar um plano NUNCA ativa recorrências (materialização só acontece na ativação)', async () => {
    const repo = new FakePlanRepository();
    const now = new Date().toISOString();
    repo.plans.set(PLAN_ID, {
      id: PLAN_ID,
      workspaceId: WORKSPACE_ID,
      name: 'Plano',
      status: 'draft',
      timezone: 'America/Sao_Paulo',
      createdAt: now,
      updatedAt: now,
    });
    const events = new FakeEventRepository();
    let materialized: string | null = null;
    const cmds = new PlanCommands(new FakeDocRepository(), repo, events, async (planId) => {
      materialized = planId;
    });

    const approved = await cmds.approvePlan(PLAN_ID);
    expect(approved.status).toBe('approved');
    expect(materialized).toBeNull();
    expect(events.events.some((e) => e.type === 'execution_plan.approved')).toBe(true);
    expect(events.events.some((e) => e.type === 'execution_plan.activated')).toBe(false);
  });

  it('ativar um plano aprovado chama a materialização e emite o evento', async () => {
    const repo = new FakePlanRepository();
    const now = new Date().toISOString();
    repo.plans.set(PLAN_ID, {
      id: PLAN_ID,
      workspaceId: WORKSPACE_ID,
      name: 'Plano',
      status: 'approved',
      timezone: 'America/Sao_Paulo',
      createdAt: now,
      updatedAt: now,
    });
    const events = new FakeEventRepository();
    let materialized: string | null = null;
    const cmds = new PlanCommands(new FakeDocRepository(), repo, events, async (planId) => {
      materialized = planId;
    });

    const active = await cmds.activatePlan(PLAN_ID);
    expect(active.status).toBe('active');
    expect(materialized).toBe(PLAN_ID);
    expect(events.events.some((e) => e.type === 'execution_plan.activated')).toBe(true);
  });
});

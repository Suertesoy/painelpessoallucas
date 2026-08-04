// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeSupabase } from './helpers/fake-supabase';
import {
  setPlanStructurerFactory,
  type PlanStructurer,
  type StructurePlanResult,
} from '@/platform/ai/plan-structurer';
import { PlanActionSchema, PlanPhaseSchema } from '@/modules/plans/domain/plan.schema';
import type { PlanProposal } from '@/modules/plans/domain/plan-proposal.schema';

/**
 * POST /api/planos/processar — sem chamadas reais à OpenAI (PlanStructurer
 * injetado). Cobre o caso real do bug: um plano de 6 semanas (Semana 1..6,
 * ações por dia da semana, grade de horários) nunca deve persistir due_rule
 * nem schedule_rule fora do contrato Zod, e reprocessar o mesmo documento
 * nunca duplica plano/ai_run.
 */

vi.mock('server-only', () => ({}));

let fakeSupabase: ReturnType<typeof createFakeSupabase>;
vi.mock('@/platform/supabase/server-client', () => ({
  getSupabaseServerClient: async () => fakeSupabase,
}));

const DOC_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';

function jsonRequest(body: unknown): Request {
  return new Request('http://x/api/planos/processar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function sourceDocRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC_ID,
    workspace_id: WORKSPACE_ID,
    project_id: null,
    title: 'Plano de Execução — Almeida Ambiental',
    document_type: 'project_plan',
    original_content: 'Semana 1 a Semana 6...',
    content_hash: 'hash-1',
    processing_status: 'pending',
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  };
}

/** Plano de 6 semanas equivalente ao caso real: fases Semana 1..6, ações por
 * dia da semana com rotina semanal de horários, prazo separado de agendamento. */
function sixWeekProposal(): PlanProposal {
  const phases = Array.from({ length: 6 }, (_, i) => ({
    name: `Semana ${i + 1}`,
    description: null,
    startOffsetDays: i * 7,
    durationDays: 7,
    milestone: null,
    successCriteria: null,
  }));

  const actions = [
    {
      title: 'Levantamento de campo (segunda da Semana 1)',
      description: null,
      phaseIndex: 0,
      actionType: 'task' as const,
      priority: 'high' as const,
      estimatedMinutes: null,
      suggestedDue: null,
      suggestedSchedule: {
        dateRule: { type: 'offset_from_phase' as const, days: 0 },
        localTime: '08:00',
      },
      recurrence: null,
      dependencies: [],
      waitingOn: null,
      reasoningSummary: null,
      needsConfirmation: false,
    },
    {
      title: 'Entrega do relatório preliminar (sexta da Semana 3)',
      description: null,
      phaseIndex: 2,
      actionType: 'milestone' as const,
      priority: 'critical' as const,
      estimatedMinutes: null,
      suggestedDue: { type: 'offset_from_phase' as const, days: 4 },
      suggestedSchedule: null,
      recurrence: null,
      dependencies: [],
      waitingOn: null,
      reasoningSummary: null,
      needsConfirmation: false,
    },
    {
      title: 'Aguardar aprovação do órgão ambiental',
      description: null,
      phaseIndex: 4,
      actionType: 'waiting' as const,
      priority: 'normal' as const,
      estimatedMinutes: null,
      suggestedDue: null,
      suggestedSchedule: null,
      recurrence: null,
      dependencies: [],
      waitingOn: 'Órgão ambiental',
      reasoningSummary: null,
      needsConfirmation: true,
    },
  ];

  return {
    projectSuggestion: 'Almeida Ambiental',
    planName: 'Almeida Ambiental — Plano de execução (6 semanas)',
    objective: 'Concluir o licenciamento ambiental',
    assumptions: [],
    confirmedFacts: [],
    openQuestions: [],
    decisions: [],
    phases,
    actions,
    milestones: [],
    risks: [],
    dependencies: [],
    waitingItems: [],
    dailyRoutines: [],
    weeklyRoutines: [
      { title: 'Reunião de status', localTime: '09:00', daysOfWeek: [1, 3, 5], estimatedMinutes: 30 },
    ],
    suggestedReminders: [],
    confidence: 0.8,
    warnings: [],
  };
}

/** Proposta com AO MENOS uma action detalhada em CADA uma das 6 fases —
 * reproduz o requisito de que nenhuma semana fique sem tarefas (causa real:
 * IA/prompt concentrando ações só na primeira fase). estimatedMinutes só é
 * preenchido na Semana 1 (simulando o único trecho do documento com duração
 * explícita, ex.: "Estudo de japonês, 30 minutos") — as demais ficam null,
 * nunca uma duração inventada. */
function sixWeekProposalAllPhasesActions(): PlanProposal {
  const phases = Array.from({ length: 6 }, (_, i) => ({
    name: `Semana ${i + 1}`,
    description: null,
    startOffsetDays: i * 7,
    durationDays: 7,
    milestone: null,
    successCriteria: null,
  }));

  const actions = Array.from({ length: 6 }, (_, i) => ({
    title: `Tarefa da Semana ${i + 1}`,
    description: null,
    phaseIndex: i,
    actionType: 'task' as const,
    priority: 'normal' as const,
    estimatedMinutes: i === 0 ? 30 : null,
    suggestedDue: null,
    suggestedSchedule: {
      dateRule: { type: 'offset_from_phase' as const, days: 0 },
      localTime: '09:00',
    },
    recurrence: null,
    dependencies: [],
    waitingOn: null,
    reasoningSummary: null,
    needsConfirmation: false,
  }));

  return {
    projectSuggestion: null,
    planName: 'Plano de 6 semanas — todas as fases com ações',
    objective: null,
    assumptions: [],
    confirmedFacts: [],
    openQuestions: [],
    decisions: [],
    phases,
    actions,
    milestones: [],
    risks: [],
    dependencies: [],
    waitingItems: [],
    dailyRoutines: [],
    weeklyRoutines: [],
    suggestedReminders: [],
    confidence: 0.9,
    warnings: [],
  };
}

function mockStructurer(proposal: unknown): PlanStructurer {
  return {
    structure: async (): Promise<StructurePlanResult> => ({
      proposal: proposal as PlanProposal,
      usage: { model: 'mock-model', inputTokens: 10, outputTokens: 20 },
    }),
  };
}

beforeEach(() => {
  fakeSupabase = createFakeSupabase({
    source_documents: [sourceDocRow()],
  });
  fakeSupabase.auth.getUser = async () => ({ data: { user: { id: 'user-1' } } });
  setPlanStructurerFactory(null as unknown as () => PlanStructurer);
});

afterEach(() => {
  setPlanStructurerFactory(null as unknown as () => PlanStructurer);
});

describe('POST /api/planos/processar', () => {
  it('persiste um plano de 6 semanas com due_rule/schedule_rule sempre válidos', async () => {
    setPlanStructurerFactory(() => mockStructurer(sixWeekProposal()));
    const { POST } = await import('@/app/api/planos/processar/route');

    const res = await POST(jsonRequest({ documentId: DOC_ID, startDate: '2026-08-05' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.planId).toBeTruthy();

    const actionRows = fakeSupabase.tables.plan_actions as Record<string, unknown>[];
    expect(actionRows.length).toBeGreaterThan(0);
    for (const row of actionRows) {
      // Mesma validação que actionRowToDomain roda ao abrir o plano — se
      // qualquer linha for inválida aqui, a página do plano quebraria.
      expect(() =>
        PlanActionSchema.parse({
          id: row.id,
          workspaceId: row.workspace_id,
          executionPlanId: row.execution_plan_id,
          phaseId: row.phase_id ?? undefined,
          title: row.title,
          description: row.description ?? undefined,
          actionType: row.action_type,
          priority: row.priority,
          estimatedMinutes: row.estimated_minutes ?? undefined,
          dueRule: row.due_rule ?? undefined,
          scheduleRule: row.schedule_rule ?? undefined,
          recurrenceRuleId: row.recurrence_rule_id ?? undefined,
          dependencyActionIds: row.dependency_action_ids ?? [],
          waitingOn: row.waiting_on ?? undefined,
          requiresConfirmation: row.requires_confirmation ?? false,
          position: row.position,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      ).not.toThrow();
    }

    const phaseRows = fakeSupabase.tables.plan_phases as Record<string, unknown>[];
    expect(phaseRows).toHaveLength(6);
    for (const row of phaseRows) {
      expect(() =>
        PlanPhaseSchema.parse({
          id: row.id,
          workspaceId: row.workspace_id,
          executionPlanId: row.execution_plan_id,
          name: row.name,
          description: row.description ?? undefined,
          position: row.position,
          startOffsetDays: row.start_offset_days ?? undefined,
          durationDays: row.duration_days ?? undefined,
          milestone: row.milestone ?? undefined,
          successCriteria: row.success_criteria ?? undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      ).not.toThrow();
    }

    // O prazo da ação-marco (Semana 3) nunca virou schedule_rule, e vice-versa.
    const milestone = actionRows.find((r) => r.action_type === 'milestone')!;
    expect(milestone.due_rule).toEqual({ type: 'offset_from_phase', days: 4 });
    expect(milestone.schedule_rule).toBeNull();
  });

  it('rejeita e nunca persiste quando o PlanStructurer (mock) devolve suggestedDue inválido', async () => {
    const bad = sixWeekProposal();
    // Simula um structurer com bug que ignora a própria validação interna
    // (parsePlanProposal) e devolve texto livre onde o domínio exige
    // PlanDateRuleSchema — exatamente a causa raiz do ZodError em produção.
    (bad.actions[1] as unknown as { suggestedDue: unknown }).suggestedDue = 'Semana 2, sexta-feira';
    setPlanStructurerFactory(() => mockStructurer(bad));
    const { POST } = await import('@/app/api/planos/processar/route');

    const res = await POST(jsonRequest({ documentId: DOC_ID, startDate: '2026-08-05' }));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error).not.toMatch(/ZodError|invalid_format|"path"/i);
    expect(fakeSupabase.tables.execution_plans ?? []).toHaveLength(0);
    expect(fakeSupabase.tables.plan_actions ?? []).toHaveLength(0);

    const aiRuns = fakeSupabase.tables.ai_runs as Record<string, unknown>[];
    expect(aiRuns.at(-1)?.status).toBe('failed');
    const docs = fakeSupabase.tables.source_documents as Record<string, unknown>[];
    expect(docs[0].processing_status).toBe('failed');
  });

  it('reprocessar um documento já concluído devolve o plano existente sem duplicar', async () => {
    const existingPlanId = 'plan-existing';
    fakeSupabase = createFakeSupabase({
      source_documents: [sourceDocRow({ processing_status: 'completed' })],
      execution_plans: [{ id: existingPlanId, source_document_id: DOC_ID, deleted_at: null, created_at: '2026-08-01T00:00:00Z' }],
      ai_runs: [{ id: 'run-existing', execution_plan_id: existingPlanId, status: 'completed', created_at: '2026-08-01T00:00:01Z' }],
    });
    fakeSupabase.auth.getUser = async () => ({ data: { user: { id: 'user-1' } } });

    let called = false;
    setPlanStructurerFactory(() => ({
      structure: async () => {
        called = true;
        throw new Error('não deveria chamar a IA de novo');
      },
    }));
    const { POST } = await import('@/app/api/planos/processar/route');

    const res = await POST(jsonRequest({ documentId: DOC_ID }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.planId).toBe(existingPlanId);
    expect(called).toBe(false);
    expect(fakeSupabase.tables.execution_plans).toHaveLength(1);
  });

  it('documento ainda em processamento (recente) responde 409 em vez de disparar uma segunda chamada de IA', async () => {
    fakeSupabase = createFakeSupabase({
      source_documents: [
        sourceDocRow({ processing_status: 'processing', updated_at: new Date().toISOString() }),
      ],
    });
    fakeSupabase.auth.getUser = async () => ({ data: { user: { id: 'user-1' } } });

    let called = false;
    setPlanStructurerFactory(() => ({
      structure: async () => {
        called = true;
        throw new Error('não deveria chamar a IA enquanto outra tentativa está em andamento');
      },
    }));
    const { POST } = await import('@/app/api/planos/processar/route');

    const res = await POST(jsonRequest({ documentId: DOC_ID }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.stillProcessing).toBe(true);
    expect(called).toBe(false);
  });

  it('documento travado em "processing" há muito tempo (tentativa anterior morta) permite reprocessar', async () => {
    const staleDate = new Date(Date.now() - 10 * 60_000).toISOString(); // 10 min atrás
    fakeSupabase = createFakeSupabase({
      source_documents: [sourceDocRow({ processing_status: 'processing', updated_at: staleDate })],
    });
    fakeSupabase.auth.getUser = async () => ({ data: { user: { id: 'user-1' } } });
    setPlanStructurerFactory(() => mockStructurer(sixWeekProposal()));
    const { POST } = await import('@/app/api/planos/processar/route');

    const res = await POST(jsonRequest({ documentId: DOC_ID, startDate: '2026-08-05' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.planId).toBeTruthy();
  });

  it('persiste ao menos uma ação em CADA uma das 6 fases — nenhuma semana fica sem tarefas', async () => {
    setPlanStructurerFactory(() => mockStructurer(sixWeekProposalAllPhasesActions()));
    const { POST } = await import('@/app/api/planos/processar/route');

    const res = await POST(jsonRequest({ documentId: DOC_ID, startDate: '2026-08-05' }));
    expect(res.status).toBe(200);

    const phaseRows = fakeSupabase.tables.plan_phases as Record<string, unknown>[];
    const actionRows = fakeSupabase.tables.plan_actions as Record<string, unknown>[];
    expect(phaseRows).toHaveLength(6);

    for (const phase of phaseRows) {
      const actionsForPhase = actionRows.filter((a) => a.phase_id === phase.id);
      expect(actionsForPhase.length).toBeGreaterThan(0);
    }

    // estimatedMinutes nunca é inventado: só a Semana 1 tinha duração
    // explícita no documento simulado; as demais chegam null e devem
    // permanecer null na persistência (não a IA nem a rota "chutam" um valor).
    const week1Phase = phaseRows.find((p) => p.name === 'Semana 1')!;
    const week1Action = actionRows.find((a) => a.phase_id === week1Phase.id)!;
    expect(week1Action.estimated_minutes).toBe(30);

    const week2Phase = phaseRows.find((p) => p.name === 'Semana 2')!;
    const week2Action = actionRows.find((a) => a.phase_id === week2Phase.id)!;
    expect(week2Action.estimated_minutes).toBeNull();
  });
});

describe('POST /api/planos/processar — reprocessamento explícito (force)', () => {
  it('arquiva o draft antigo e cria um novo — nunca duplica plano visível, nunca perde o documento', async () => {
    const oldPlanId = 'plan-old';
    fakeSupabase = createFakeSupabase({
      source_documents: [sourceDocRow({ processing_status: 'completed' })],
      execution_plans: [
        {
          id: oldPlanId,
          workspace_id: WORKSPACE_ID,
          source_document_id: DOC_ID,
          status: 'draft',
          deleted_at: null,
          created_at: '2026-08-01T00:00:00Z',
        },
      ],
    });
    fakeSupabase.auth.getUser = async () => ({ data: { user: { id: 'user-1' } } });
    setPlanStructurerFactory(() => mockStructurer(sixWeekProposal()));
    const { POST } = await import('@/app/api/planos/processar/route');

    const res = await POST(jsonRequest({ documentId: DOC_ID, startDate: '2026-08-05', force: true }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.planId).not.toBe(oldPlanId);

    const plans = fakeSupabase.tables.execution_plans as Record<string, unknown>[];
    const old = plans.find((p) => p.id === oldPlanId)!;
    expect(old.status).toBe('archived');
    // O source_document nunca é apagado nem perde conteúdo.
    const docs = fakeSupabase.tables.source_documents as Record<string, unknown>[];
    expect(docs[0].id).toBe(DOC_ID);

    // Nunca duplica plano visível: só um plano não-arquivado para o documento.
    const nonArchived = plans.filter((p) => p.status !== 'archived' && p.deleted_at == null);
    expect(nonArchived).toHaveLength(1);
    expect(nonArchived[0].id).toBe(json.planId);
  });

  it('nunca reprocessa automaticamente um plano já aprovado/ativo (409, IA nunca chamada)', async () => {
    const approvedPlanId = 'plan-approved';
    fakeSupabase = createFakeSupabase({
      source_documents: [sourceDocRow({ processing_status: 'completed' })],
      execution_plans: [
        {
          id: approvedPlanId,
          workspace_id: WORKSPACE_ID,
          source_document_id: DOC_ID,
          status: 'active',
          deleted_at: null,
          created_at: '2026-08-01T00:00:00Z',
        },
      ],
    });
    fakeSupabase.auth.getUser = async () => ({ data: { user: { id: 'user-1' } } });
    let called = false;
    setPlanStructurerFactory(() => ({
      structure: async () => {
        called = true;
        throw new Error('não deveria chamar a IA para um plano já ativo');
      },
    }));
    const { POST } = await import('@/app/api/planos/processar/route');

    const res = await POST(jsonRequest({ documentId: DOC_ID, force: true }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(called).toBe(false);
    expect(json.error).toMatch(/aprovado ou em andamento/);

    const plans = fakeSupabase.tables.execution_plans as Record<string, unknown>[];
    expect(plans.find((p) => p.id === approvedPlanId)?.status).toBe('active');
  });
});

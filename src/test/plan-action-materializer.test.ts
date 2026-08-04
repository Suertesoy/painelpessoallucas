import { describe, it, expect } from 'vitest';
import { createFakeSupabase } from './helpers/fake-supabase';
import { materializeOneOffActions } from '@/modules/plans/application/plan-action-materializer';
import { zonedDateTimeToUtc } from '@/modules/plans/domain/recurrence-engine';

const TZ = 'America/Sao_Paulo';
const PLAN_ID = 'plan-1';
const WORKSPACE_ID = 'ws-1';
const PHASE_1 = 'phase-1'; // Semana 1: startOffsetDays 0
const PHASE_3 = 'phase-3'; // Semana 3: startOffsetDays 14

function basePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAN_ID,
    start_date: '2026-08-05', // quarta-feira
    timezone: TZ,
    project_id: null,
    ...overrides,
  };
}

function basePhases() {
  return [
    { id: PHASE_1, execution_plan_id: PLAN_ID, start_offset_days: 0 },
    { id: PHASE_3, execution_plan_id: PLAN_ID, start_offset_days: 14 },
  ];
}

function action(overrides: Record<string, unknown>) {
  return {
    id: overrides.id ?? 'action-1',
    workspace_id: WORKSPACE_ID,
    execution_plan_id: PLAN_ID,
    phase_id: null,
    title: 'Ação',
    description: null,
    action_type: 'task',
    priority: 'normal',
    estimated_minutes: null,
    due_rule: null,
    schedule_rule: null,
    recurrence_rule_id: null,
    waiting_on: null,
    project_assignment: 'inherit',
    project_id: null,
    ...overrides,
  };
}

describe('materializeOneOffActions', () => {
  it('materializa uma ação com prazo fixo em item.dueAt (23:59 local)', async () => {
    const supabase = createFakeSupabase({
      execution_plans: [basePlan()],
      plan_phases: basePhases(),
      plan_actions: [
        action({ id: 'a-due', title: 'Enviar proposta', due_rule: { type: 'fixed', date: '2026-08-10' } }),
      ],
    });

    const result = await materializeOneOffActions(supabase as never, PLAN_ID);
    expect(result.created).toBe(1);

    const items = (supabase.tables.items ?? []) as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(items[0].plan_action_id).toBe('a-due');
    expect(items[0].due_at).toBe(zonedDateTimeToUtc('2026-08-10', '23:59', TZ).toISOString());
    expect(items[0].scheduled_at).toBeNull();
  });

  it('resolve offset_from_phase relativo ao início da fase (nunca uma data fixa inventada)', async () => {
    // Semana 3 (phase-3, offset 14 dias a partir do início do plano) + 4 dias
    // = 2026-08-05 + 18 dias = 2026-08-23. A IA nunca precisa saber essa data
    // absoluta — só phaseIndex + offset relativo à fase.
    const supabase = createFakeSupabase({
      execution_plans: [basePlan()],
      plan_phases: basePhases(),
      plan_actions: [
        action({
          id: 'a-phase',
          phase_id: PHASE_3,
          title: 'Reunião de alinhamento da Semana 3',
          schedule_rule: { dateRule: { type: 'offset_from_phase', days: 4 }, time: '10:00' },
        }),
      ],
    });

    await materializeOneOffActions(supabase as never, PLAN_ID);
    const items = supabase.tables.items as Record<string, unknown>[];
    expect(items[0].scheduled_at).toBe(zonedDateTimeToUtc('2026-08-23', '10:00', TZ).toISOString());
    expect(items[0].due_at).toBeNull();
  });

  it('separa prazo de agendamento quando a ação tem os dois', async () => {
    const supabase = createFakeSupabase({
      execution_plans: [basePlan()],
      plan_phases: basePhases(),
      plan_actions: [
        action({
          id: 'a-both',
          due_rule: { type: 'offset_from_start', days: 10 },
          schedule_rule: { dateRule: { type: 'offset_from_start', days: 2 }, time: '14:00' },
        }),
      ],
    });

    await materializeOneOffActions(supabase as never, PLAN_ID);
    const items = supabase.tables.items as Record<string, unknown>[];
    expect(items[0].due_at).toBe(zonedDateTimeToUtc('2026-08-15', '23:59', TZ).toISOString());
    expect(items[0].scheduled_at).toBe(zonedDateTimeToUtc('2026-08-07', '14:00', TZ).toISOString());
  });

  it('ação do tipo waiting vira item bloqueado com o motivo no conteúdo', async () => {
    const supabase = createFakeSupabase({
      execution_plans: [basePlan()],
      plan_phases: [],
      plan_actions: [
        action({
          id: 'a-waiting',
          action_type: 'waiting',
          waiting_on: 'Retorno do cliente',
          due_rule: { type: 'offset_from_start', days: 1 },
        }),
      ],
    });

    await materializeOneOffActions(supabase as never, PLAN_ID);
    const items = supabase.tables.items as Record<string, unknown>[];
    expect(items[0].status).toBe('blocked');
    expect(items[0].content).toContain('Aguardando: Retorno do cliente');
  });

  it('ignora ações recorrentes (com recurrence_rule_id) e rotinas', async () => {
    const supabase = createFakeSupabase({
      execution_plans: [basePlan()],
      plan_phases: [],
      plan_actions: [
        action({ id: 'a-recurring', recurrence_rule_id: 'rule-1', due_rule: { type: 'offset_from_start', days: 1 } }),
        action({ id: 'a-routine', action_type: 'routine', schedule_rule: { time: '08:00' } }),
      ],
    });

    // O filtro real (.is('recurrence_rule_id', null)) já exclui a-recurring
    // na consulta; simulamos aqui só a ação de rotina remanescente.
    const result = await materializeOneOffActions(supabase as never, PLAN_ID);
    expect(result.created).toBe(0);
    expect(supabase.tables.items ?? []).toHaveLength(0);
  });

  it('ação sem prazo nem agendamento não vira item (continua só na definição do plano)', async () => {
    const supabase = createFakeSupabase({
      execution_plans: [basePlan()],
      plan_phases: [],
      plan_actions: [action({ id: 'a-none' })],
    });

    const result = await materializeOneOffActions(supabase as never, PLAN_ID);
    expect(result.created).toBe(0);
    expect(supabase.tables.items ?? []).toHaveLength(0);
  });

  it('é idempotente: reativar/reexecutar não duplica items (chave única plan_action_id)', async () => {
    const supabase = createFakeSupabase({
      execution_plans: [basePlan()],
      plan_phases: [],
      plan_actions: [action({ id: 'a-idem', due_rule: { type: 'offset_from_start', days: 1 } })],
    });

    const first = await materializeOneOffActions(supabase as never, PLAN_ID);
    expect(first.created).toBe(1);

    const second = await materializeOneOffActions(supabase as never, PLAN_ID);
    expect(second.created).toBe(0);

    expect(supabase.tables.items).toHaveLength(1);
  });

  describe('projeto por ação (inherit | specific | none)', () => {
    const PLAN_PROJECT_ID = 'project-almeida';
    const OTHER_PROJECT_ID = 'project-carreira';

    it('inherit: item.project_id recebe o projeto do plano', async () => {
      const supabase = createFakeSupabase({
        execution_plans: [basePlan({ project_id: PLAN_PROJECT_ID })],
        plan_phases: [],
        plan_actions: [
          action({
            id: 'a-inherit',
            due_rule: { type: 'offset_from_start', days: 1 },
            project_assignment: 'inherit',
          }),
        ],
      });

      await materializeOneOffActions(supabase as never, PLAN_ID);
      const items = supabase.tables.items as Record<string, unknown>[];
      expect(items[0].project_id).toBe(PLAN_PROJECT_ID);
    });

    it('specific: item.project_id recebe o projeto da própria ação, nunca o do plano', async () => {
      const supabase = createFakeSupabase({
        execution_plans: [basePlan({ project_id: PLAN_PROJECT_ID })],
        plan_phases: [],
        plan_actions: [
          action({
            id: 'a-specific',
            title: 'Aplicação para vagas',
            due_rule: { type: 'offset_from_start', days: 1 },
            project_assignment: 'specific',
            project_id: OTHER_PROJECT_ID,
          }),
        ],
      });

      await materializeOneOffActions(supabase as never, PLAN_ID);
      const items = supabase.tables.items as Record<string, unknown>[];
      expect(items[0].project_id).toBe(OTHER_PROJECT_ID);
    });

    it('none: item.project_id é null mesmo quando o plano tem projeto', async () => {
      const supabase = createFakeSupabase({
        execution_plans: [basePlan({ project_id: PLAN_PROJECT_ID })],
        plan_phases: [],
        plan_actions: [
          action({
            id: 'a-none',
            title: 'Estudo de japonês',
            due_rule: { type: 'offset_from_start', days: 1 },
            project_assignment: 'none',
          }),
        ],
      });

      await materializeOneOffActions(supabase as never, PLAN_ID);
      const items = supabase.tables.items as Record<string, unknown>[];
      expect(items[0].project_id).toBeNull();
    });

    it('linha legada sem project_assignment (anterior a este campo) se comporta como inherit', async () => {
      const supabase = createFakeSupabase({
        execution_plans: [basePlan({ project_id: PLAN_PROJECT_ID })],
        plan_phases: [],
        plan_actions: [
          action({
            id: 'a-legacy',
            due_rule: { type: 'offset_from_start', days: 1 },
            project_assignment: undefined,
          }),
        ],
      });

      await materializeOneOffActions(supabase as never, PLAN_ID);
      const items = supabase.tables.items as Record<string, unknown>[];
      expect(items[0].project_id).toBe(PLAN_PROJECT_ID);
    });
  });
});

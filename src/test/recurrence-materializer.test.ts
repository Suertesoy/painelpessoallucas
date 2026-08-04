import { describe, it, expect } from 'vitest';
import { createFakeSupabase } from './helpers/fake-supabase';
import {
  materializeRule,
  activateAndMaterializePlanRules,
  materializeDueRules,
} from '@/modules/plans/application/recurrence-materializer';
import { zonedDateTimeToUtc } from '@/modules/plans/domain/recurrence-engine';

/**
 * A recurrence_rule não guarda projeto — a relação é resolvida pela
 * PlanAction que a possui (project_assignment/project_id), igual ao caminho
 * de ações únicas (plan-action-materializer.test.ts). Cobre os três casos
 * (inherit/specific/none) tanto na ativação do plano quanto no cron
 * (materializeDueRules, que precisa resolver o projeto do plano em lote).
 */

const TZ = 'America/Sao_Paulo';
const WORKSPACE_ID = 'ws-1';
const NOW = new Date('2026-08-01T12:00:00Z'); // sábado

function rule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    workspace_id: WORKSPACE_ID,
    execution_plan_id: 'plan-1',
    frequency: 'weekly',
    interval: 1,
    days_of_week: [1], // segunda
    day_of_month: null,
    local_time: '16:30',
    timezone: TZ,
    start_at: zonedDateTimeToUtc('2026-08-03', '16:30', TZ).toISOString(),
    end_at: null,
    max_occurrences: null,
    next_occurrence_at: null,
    is_active: true,
    ...overrides,
  };
}

function action(overrides: Record<string, unknown> = {}) {
  return {
    id: 'action-1',
    title: 'Rotina',
    description: null,
    priority: 'normal',
    estimated_minutes: null,
    phase_id: null,
    execution_plan_id: 'plan-1',
    recurrence_rule_id: null,
    project_assignment: 'inherit',
    project_id: null,
    ...overrides,
  };
}

describe('materializeRule — projeto por ação (planProjectId como parâmetro)', () => {
  it('inherit: ocorrências recebem o project_id do plano', async () => {
    const supabase = createFakeSupabase({ items: [] });
    await materializeRule(
      supabase as never,
      rule() as never,
      action({ project_assignment: 'inherit' }),
      NOW,
      14,
      'plan-project'
    );
    const items = supabase.tables.items as Record<string, unknown>[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.project_id === 'plan-project')).toBe(true);
  });

  it('specific: ocorrências usam o project_id da própria ação, nunca o do plano', async () => {
    const supabase = createFakeSupabase({ items: [] });
    await materializeRule(
      supabase as never,
      rule() as never,
      action({ project_assignment: 'specific', project_id: 'action-project' }),
      NOW,
      14,
      'plan-project'
    );
    const items = supabase.tables.items as Record<string, unknown>[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.project_id === 'action-project')).toBe(true);
  });

  it('none: ocorrências sempre sem projeto, mesmo com o plano tendo projeto', async () => {
    const supabase = createFakeSupabase({ items: [] });
    await materializeRule(supabase as never, rule() as never, action({ project_assignment: 'none' }), NOW, 14, 'plan-project');
    const items = supabase.tables.items as Record<string, unknown>[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.project_id === null)).toBe(true);
  });

  it('regra sem ação vinculada (rotina órfã): usa direto o projeto do plano', async () => {
    const supabase = createFakeSupabase({ items: [] });
    await materializeRule(supabase as never, rule() as never, null, NOW, 14, 'plan-project');
    const items = supabase.tables.items as Record<string, unknown>[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.project_id === 'plan-project')).toBe(true);
  });
});

describe('activateAndMaterializePlanRules — resolve o projeto de cada regra pela action vinculada', () => {
  it('duas rotinas do mesmo plano com projectAssignment diferente materializam com projetos diferentes', async () => {
    const supabase = createFakeSupabase({
      execution_plans: [
        { id: 'plan-1', workspace_id: WORKSPACE_ID, project_id: 'plan-project', start_date: '2026-08-03', timezone: TZ },
      ],
      recurrence_rules: [
        rule({ id: 'rule-specific', start_at: null }),
        rule({ id: 'rule-none', start_at: null }),
      ],
      plan_actions: [
        action({
          id: 'act-specific',
          recurrence_rule_id: 'rule-specific',
          project_assignment: 'specific',
          project_id: 'other-project',
        }),
        action({ id: 'act-none', recurrence_rule_id: 'rule-none', project_assignment: 'none' }),
      ],
      plan_phases: [],
    });

    await activateAndMaterializePlanRules(supabase as never, 'plan-1', NOW);
    const items = supabase.tables.items as Record<string, unknown>[];
    const specificItems = items.filter((i) => i.recurrence_rule_id === 'rule-specific');
    const noneItems = items.filter((i) => i.recurrence_rule_id === 'rule-none');

    expect(specificItems.length).toBeGreaterThan(0);
    expect(specificItems.every((i) => i.project_id === 'other-project')).toBe(true);
    expect(noneItems.length).toBeGreaterThan(0);
    expect(noneItems.every((i) => i.project_id === null)).toBe(true);
  });
});

describe('materializeDueRules (cron) — resolve o projeto do plano em lote', () => {
  it('busca o projeto de cada plano de uma vez e aplica por regra vencida', async () => {
    const supabase = createFakeSupabase({
      recurrence_rules: [
        rule({ id: 'rule-a', execution_plan_id: 'plan-a' }),
        rule({ id: 'rule-b', execution_plan_id: 'plan-b' }),
      ],
      execution_plans: [
        { id: 'plan-a', project_id: 'project-a' },
        { id: 'plan-b', project_id: 'project-b' },
      ],
      plan_actions: [
        action({ id: 'act-a', recurrence_rule_id: 'rule-a', execution_plan_id: 'plan-a', project_assignment: 'inherit' }),
        action({ id: 'act-b', recurrence_rule_id: 'rule-b', execution_plan_id: 'plan-b', project_assignment: 'inherit' }),
      ],
    });

    await materializeDueRules(supabase as never, NOW);
    const items = supabase.tables.items as Record<string, unknown>[];
    const itemsA = items.filter((i) => i.recurrence_rule_id === 'rule-a');
    const itemsB = items.filter((i) => i.recurrence_rule_id === 'rule-b');

    expect(itemsA.length).toBeGreaterThan(0);
    expect(itemsA.every((i) => i.project_id === 'project-a')).toBe(true);
    expect(itemsB.length).toBeGreaterThan(0);
    expect(itemsB.every((i) => i.project_id === 'project-b')).toBe(true);
  });
});

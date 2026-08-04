import type { SupabaseClient } from '@supabase/supabase-js';
import { zonedDateTimeToUtc, addDaysToDateStr } from '../domain/recurrence-engine';
import { resolveActionProjectId } from '../domain/project-assignment';

/**
 * Materializa ações NÃO recorrentes de um plano em `items` (ocorrências
 * executáveis) na ativação.
 *
 * O plano aprovado continua sendo a definição (plan_actions); esta função
 * gera a ocorrência material que aparece em Hoje/Agenda — o mesmo princípio
 * já aplicado a recorrências por `recurrence-materializer.ts`, aqui para
 * ações de ocorrência única (sem recurrence_rule_id).
 *
 * Idempotente: chave única `items.plan_action_id` (uma ação de plano vira no
 * máximo um item) + upsert com `ignoreDuplicates` — reativar, recarregar ou
 * reexecutar a automação nunca duplica.
 */

interface PlanDateRuleRow {
  type: 'fixed' | 'offset_from_start' | 'offset_from_phase';
  date?: string;
  days?: number;
}

interface PlanActionRow {
  id: string;
  workspace_id: string;
  execution_plan_id: string;
  phase_id: string | null;
  title: string;
  description: string | null;
  action_type: string;
  priority: string;
  estimated_minutes: number | null;
  due_rule: PlanDateRuleRow | null;
  schedule_rule: { dateRule?: PlanDateRuleRow; time?: string; durationMinutes?: number } | null;
  recurrence_rule_id: string | null;
  waiting_on: string | null;
  project_assignment: string | null;
  project_id: string | null;
}

/** item.type por action_type — só os tipos de ação materializáveis em item. */
const ITEM_TYPE_BY_ACTION: Record<string, string> = {
  task: 'task',
  milestone: 'task',
  waiting: 'task',
  decision: 'decision',
  reminder: 'reminder',
};

/** item.status por action_type (default: 'planned'). */
const ITEM_STATUS_BY_ACTION: Record<string, string> = {
  waiting: 'blocked',
};

/** Resolve um PlanDateRule (fixo ou relativo) para uma data local YYYY-MM-DD. */
function resolveDate(
  rule: PlanDateRuleRow | null | undefined,
  planStartDate: string,
  phaseStartOffsetDays: number
): string | null {
  if (!rule) return null;
  if (rule.type === 'fixed' && rule.date) return rule.date;
  if (rule.type === 'offset_from_start' && rule.days != null) {
    return addDaysToDateStr(planStartDate, rule.days);
  }
  if (rule.type === 'offset_from_phase' && rule.days != null) {
    const phaseStart = addDaysToDateStr(planStartDate, phaseStartOffsetDays);
    return addDaysToDateStr(phaseStart, rule.days);
  }
  return null;
}

export interface MaterializeActionsResult {
  created: number;
  total: number;
}

export async function materializeOneOffActions(
  supabase: SupabaseClient,
  planId: string
): Promise<MaterializeActionsResult> {
  const { data: plan, error: planError } = await supabase
    .from('execution_plans')
    .select('id, project_id, start_date, timezone')
    .eq('id', planId)
    .maybeSingle();
  if (planError || !plan) {
    throw new Error(`Plano não encontrado para materialização: ${planError?.message ?? planId}`);
  }

  const planProjectId: string | null = plan.project_id ?? null;
  const timezone: string = plan.timezone || 'America/Sao_Paulo';
  const startDate: string =
    plan.start_date ?? new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());

  const [{ data: actions, error: actionsError }, { data: phases, error: phasesError }] = await Promise.all([
    supabase
      .from('plan_actions')
      .select('*')
      .eq('execution_plan_id', planId)
      .is('recurrence_rule_id', null),
    supabase.from('plan_phases').select('id, start_offset_days').eq('execution_plan_id', planId),
  ]);
  if (actionsError) throw new Error(`Falha ao carregar ações: ${actionsError.message}`);
  if (phasesError) throw new Error(`Falha ao carregar fases: ${phasesError.message}`);

  const phaseOffset = new Map<string, number>();
  for (const phase of phases ?? []) phaseOffset.set(phase.id, phase.start_offset_days ?? 0);

  const rows: Record<string, unknown>[] = [];
  for (const action of (actions ?? []) as PlanActionRow[]) {
    // Rotinas só viram item pela regra de recorrência (já excluídas pelo
    // filtro recurrence_rule_id acima, mas o tipo é reforçado por clareza).
    if (action.action_type === 'routine') continue;

    const phaseStartOffset = action.phase_id ? phaseOffset.get(action.phase_id) ?? 0 : 0;
    const dueDate = resolveDate(action.due_rule, startDate, phaseStartOffset);
    const scheduleDate =
      resolveDate(action.schedule_rule?.dateRule, startDate, phaseStartOffset) ??
      (action.schedule_rule?.time ? dueDate : null);

    // Sem prazo nem agendamento: nada ainda para materializar como ocorrência
    // datada (a ação continua visível na definição do plano).
    if (!dueDate && !scheduleDate) continue;

    const dueAt = dueDate ? zonedDateTimeToUtc(dueDate, '23:59', timezone).toISOString() : null;
    const scheduledAt =
      scheduleDate && action.schedule_rule?.time
        ? zonedDateTimeToUtc(scheduleDate, action.schedule_rule.time, timezone).toISOString()
        : null;

    const content =
      action.action_type === 'waiting' && action.waiting_on
        ? [action.description, `Aguardando: ${action.waiting_on}`].filter(Boolean).join('\n')
        : action.description;

    rows.push({
      id: crypto.randomUUID(),
      workspace_id: action.workspace_id,
      title: action.title,
      content: content ?? null,
      type: ITEM_TYPE_BY_ACTION[action.action_type] ?? 'task',
      status: ITEM_STATUS_BY_ACTION[action.action_type] ?? 'planned',
      priority: action.priority,
      due_at: dueAt,
      scheduled_at: scheduledAt,
      estimated_minutes: action.estimated_minutes,
      source: 'automation',
      execution_plan_id: action.execution_plan_id,
      plan_phase_id: action.phase_id,
      plan_action_id: action.id,
      project_id: resolveActionProjectId(
        { projectAssignment: action.project_assignment, projectId: action.project_id },
        planProjectId
      ),
    });
  }

  if (rows.length === 0) return { created: 0, total: 0 };

  const actionIds = rows.map((r) => r.plan_action_id as string);
  const { data: existing, error: existingError } = await supabase
    .from('items')
    .select('plan_action_id')
    .in('plan_action_id', actionIds);
  if (existingError) {
    throw new Error(`Falha ao verificar ocorrências existentes: ${existingError.message}`);
  }
  const existingSet = new Set((existing ?? []).map((r) => r.plan_action_id as string));

  const { error } = await supabase
    .from('items')
    .upsert(rows, { onConflict: 'plan_action_id', ignoreDuplicates: true });
  if (error) throw new Error(`Falha ao materializar ações do plano: ${error.message}`);

  const created = rows.filter((r) => !existingSet.has(r.plan_action_id as string)).length;
  return { created, total: rows.length };
}

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  occurrencesBetween,
  nextOccurrenceAfter,
  zonedDateTimeToUtc,
  addDaysToDateStr,
  type RecurrenceSpec,
} from '../domain/recurrence-engine';

/**
 * Serviço de materialização de ocorrências.
 *
 * Transforma regras de recorrência APROVADAS em itens (tarefas) reais.
 * - Idempotente: chave única (recurrence_rule_id, occurrence_at) no banco +
 *   upsert com ignoreDuplicates ⇒ nunca gera a mesma ocorrência duas vezes.
 * - Isomórfico: roda no navegador (ativação do plano) e no servidor (cron),
 *   recebendo o SupabaseClient adequado.
 */

export const DEFAULT_HORIZON_DAYS = 7;

interface RuleRow {
  id: string;
  workspace_id: string;
  execution_plan_id: string | null;
  frequency: RecurrenceSpec['frequency'];
  interval: number;
  days_of_week: number[] | null;
  day_of_month: number | null;
  local_time: string | null;
  timezone: string;
  start_at: string | null;
  end_at: string | null;
  max_occurrences: number | null;
  is_active: boolean;
}

interface ActionRow {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  estimated_minutes: number | null;
  phase_id: string | null;
  execution_plan_id: string;
}

function ruleToSpec(rule: RuleRow): RecurrenceSpec {
  return {
    frequency: rule.frequency,
    interval: rule.interval ?? 1,
    daysOfWeek: rule.days_of_week ?? undefined,
    dayOfMonth: rule.day_of_month ?? undefined,
    localTime: rule.local_time ?? undefined,
    timezone: rule.timezone || 'America/Sao_Paulo',
    startAt: rule.start_at ?? undefined,
    endAt: rule.end_at ?? undefined,
    maxOccurrences: rule.max_occurrences ?? undefined,
  };
}

export interface MaterializeResult {
  ruleId: string;
  created: number;
  nextOccurrenceAt: string | null;
}

/** Materializa as ocorrências de uma regra no horizonte dado. */
export async function materializeRule(
  supabase: SupabaseClient,
  rule: RuleRow,
  action: ActionRow | null,
  now: Date,
  horizonDays = DEFAULT_HORIZON_DAYS
): Promise<MaterializeResult> {
  if (!rule.is_active || !rule.start_at) {
    return { ruleId: rule.id, created: 0, nextOccurrenceAt: null };
  }

  // Quantas ocorrências já existem (para respeitar max_occurrences).
  const { count: existingCount, error: countError } = await supabase
    .from('items')
    .select('id', { count: 'exact', head: true })
    .eq('recurrence_rule_id', rule.id);
  if (countError) {
    throw new Error(`Falha ao contar ocorrências existentes: ${countError.message}`);
  }

  const spec = ruleToSpec(rule);
  const horizonEnd = new Date(now.getTime() + horizonDays * 86_400_000);
  const occurrences = occurrencesBetween(spec, now, horizonEnd, existingCount ?? 0);

  let created = 0;
  if (occurrences.length > 0) {
    const rows = occurrences.map((occ) => ({
      id: crypto.randomUUID(),
      workspace_id: rule.workspace_id,
      title: action?.title ?? 'Rotina do plano',
      content: action?.description ?? null,
      type: 'task',
      status: 'planned',
      priority: action?.priority ?? 'normal',
      scheduled_at: occ.occurrenceAt,
      estimated_minutes: action?.estimated_minutes ?? null,
      source: 'automation',
      execution_plan_id: rule.execution_plan_id ?? action?.execution_plan_id ?? null,
      plan_phase_id: action?.phase_id ?? null,
      plan_action_id: action?.id ?? null,
      recurrence_rule_id: rule.id,
      occurrence_at: occ.occurrenceAt,
    }));

    const { error } = await supabase
      .from('items')
      .upsert(rows, {
        onConflict: 'recurrence_rule_id,occurrence_at',
        ignoreDuplicates: true,
      });
    if (error) {
      throw new Error(`Falha ao materializar ocorrências: ${error.message}`);
    }

    // Contagem real de novos (idempotência: reexecução não recria).
    const { count: afterCount } = await supabase
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('recurrence_rule_id', rule.id);
    created = Math.max(0, (afterCount ?? 0) - (existingCount ?? 0));
  }

  const nextAt = nextOccurrenceAfter(spec, horizonEnd, (existingCount ?? 0) + created);
  const lastLocal = occurrences.at(-1)?.occurrenceAt ?? null;

  const { error: updateError } = await supabase
    .from('recurrence_rules')
    .update({
      next_occurrence_at: nextAt,
      ...(lastLocal ? { last_occurrence_at: lastLocal } : {}),
    })
    .eq('id', rule.id);
  if (updateError) {
    throw new Error(`Falha ao atualizar a regra: ${updateError.message}`);
  }

  return { ruleId: rule.id, created, nextOccurrenceAt: nextAt };
}

/**
 * Ativa e materializa as regras de um plano recém-ativado:
 * 1. Resolve start_at das regras sem âncora (data inicial do plano + offset
 *    da fase quando a regra nasce de uma ação de fase).
 * 2. Marca as regras como ativas.
 * 3. Gera as ocorrências do horizonte inicial.
 */
export async function activateAndMaterializePlanRules(
  supabase: SupabaseClient,
  planId: string,
  now: Date = new Date()
): Promise<MaterializeResult[]> {
  const { data: plan, error: planError } = await supabase
    .from('execution_plans')
    .select('id, workspace_id, start_date, timezone')
    .eq('id', planId)
    .maybeSingle();
  if (planError || !plan) {
    throw new Error(`Plano não encontrado para materialização: ${planError?.message ?? planId}`);
  }

  const timezone = plan.timezone || 'America/Sao_Paulo';
  const startDate: string =
    plan.start_date ??
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);

  const [{ data: rules, error: rulesError }, { data: actions, error: actionsError }, { data: phases }] =
    await Promise.all([
      supabase.from('recurrence_rules').select('*').eq('execution_plan_id', planId),
      supabase.from('plan_actions').select('*').eq('execution_plan_id', planId),
      supabase.from('plan_phases').select('id, start_offset_days').eq('execution_plan_id', planId),
    ]);
  if (rulesError) throw new Error(`Falha ao carregar regras: ${rulesError.message}`);
  if (actionsError) throw new Error(`Falha ao carregar ações: ${actionsError.message}`);

  const actionByRule = new Map<string, ActionRow>();
  for (const action of (actions ?? []) as (ActionRow & { recurrence_rule_id: string | null })[]) {
    if (action.recurrence_rule_id) actionByRule.set(action.recurrence_rule_id, action);
  }
  const phaseOffset = new Map<string, number>();
  for (const phase of phases ?? []) {
    phaseOffset.set(phase.id, phase.start_offset_days ?? 0);
  }

  const results: MaterializeResult[] = [];
  for (const rule of (rules ?? []) as RuleRow[]) {
    // Resolve âncora determinística.
    let startAt = rule.start_at;
    if (!startAt) {
      let anchorDate = startDate;
      if (rule.frequency === 'relative_to_phase_start') {
        const action = actionByRule.get(rule.id);
        const offset = action?.phase_id ? phaseOffset.get(action.phase_id) ?? 0 : 0;
        anchorDate = addDaysToDateStr(startDate, offset);
      }
      startAt = zonedDateTimeToUtc(anchorDate, rule.local_time ?? '09:00', timezone).toISOString();
    }

    const { error: activateError } = await supabase
      .from('recurrence_rules')
      .update({ is_active: true, start_at: startAt })
      .eq('id', rule.id);
    if (activateError) {
      throw new Error(`Falha ao ativar regra: ${activateError.message}`);
    }

    const activeRule: RuleRow = { ...rule, is_active: true, start_at: startAt };
    results.push(await materializeRule(supabase, activeRule, actionByRule.get(rule.id) ?? null, now));
  }

  return results;
}

/** Regras ativas vencidas (next_occurrence_at no passado) — usado pelo cron. */
export async function materializeDueRules(
  supabase: SupabaseClient,
  now: Date = new Date(),
  horizonDays = DEFAULT_HORIZON_DAYS
): Promise<MaterializeResult[]> {
  const { data: rules, error } = await supabase
    .from('recurrence_rules')
    .select('*')
    .eq('is_active', true)
    .or(`next_occurrence_at.is.null,next_occurrence_at.lte.${now.toISOString()}`);
  if (error) throw new Error(`Falha ao buscar regras vencidas: ${error.message}`);

  const results: MaterializeResult[] = [];
  for (const rule of (rules ?? []) as RuleRow[]) {
    let action: ActionRow | null = null;
    const { data: actionRow } = await supabase
      .from('plan_actions')
      .select('*')
      .eq('recurrence_rule_id', rule.id)
      .limit(1)
      .maybeSingle();
    action = (actionRow as ActionRow | null) ?? null;
    results.push(await materializeRule(supabase, rule, action, now, horizonDays));
  }
  return results;
}

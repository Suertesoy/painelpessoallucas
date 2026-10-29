import type { SupabaseClient } from '@supabase/supabase-js';
import { planRuleApplication, type CategoryRule, type RuleTarget } from '../domain/category-rules';
import { planLearning, type LearnableItem } from '../domain/category-learning-policy';
import { DEFAULT_CATEGORIES } from '../domain/categories';

/**
 * Persistência das categorias personalizadas e das regras aprendidas.
 * Usado no navegador (repositório) e no servidor (após importar uma fatura).
 * Tudo sob RLS do usuário; toda consulta filtra por workspace. Nada aqui
 * altera valores, datas ou vínculos: só category / category_source /
 * category_rule_id dos lançamentos.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const MISSING_SCHEMA = new Set(['42P01', 'PGRST205', '42703']);

export class CategoryLearningError extends Error {}

function fail(context: string, error: { message: string; code?: string }): never {
  console.error(`[finance-category-learning] ${context}`, error.code ?? '');
  throw new CategoryLearningError(`${context}. Tente novamente.`);
}

const toRule = (r: Row): CategoryRule => ({
  id: r.id,
  merchantKey: r.merchant_key,
  amountCents: r.amount_cents === null || r.amount_cents === undefined ? null : Number(r.amount_cents),
  category: r.category,
});

export async function listCategoryRules(supabase: SupabaseClient, workspaceId: string): Promise<CategoryRule[]> {
  const { data, error } = await supabase.from('finance_category_rules').select('*')
    .eq('workspace_id', workspaceId).order('created_at');
  if (error) {
    if (error.code && MISSING_SCHEMA.has(error.code)) return [];
    fail('Não foi possível carregar as regras', error);
  }
  return (data ?? []).map(toRule);
}

/** Cria a regra ou, se já existe a mesma (estabelecimento + valor), troca a categoria dela. */
export async function saveCategoryRule(
  supabase: SupabaseClient, workspaceId: string, input: { merchantKey: string; amountCents: number | null; category: string }
): Promise<CategoryRule> {
  let q = supabase.from('finance_category_rules').select('*').eq('workspace_id', workspaceId).eq('merchant_key', input.merchantKey);
  q = input.amountCents === null ? q.is('amount_cents', null) : q.eq('amount_cents', input.amountCents);
  const { data: existing, error: findError } = await q.maybeSingle();
  if (findError) fail('Não foi possível salvar a regra', findError);
  if (existing) {
    const { data, error } = await supabase.from('finance_category_rules').update({ category: input.category })
      .eq('workspace_id', workspaceId).eq('id', existing.id).select().single();
    if (error) fail('Não foi possível salvar a regra', error);
    return toRule(data);
  }
  const { data, error } = await supabase.from('finance_category_rules').insert({
    workspace_id: workspaceId, merchant_key: input.merchantKey, amount_cents: input.amountCents, category: input.category,
  }).select().single();
  if (error) fail('Não foi possível salvar a regra', error);
  return toRule(data);
}

/** Troca a categoria da regra e dos lançamentos que ELA aplicou (os confirmados por você não mudam). */
export async function changeRuleCategory(supabase: SupabaseClient, workspaceId: string, ruleId: string, category: string): Promise<void> {
  const { error } = await supabase.from('finance_category_rules').update({ category })
    .eq('workspace_id', workspaceId).eq('id', ruleId);
  if (error) fail('Não foi possível alterar a regra', error);
  const { error: itemsError } = await supabase.from('finance_invoice_items').update({ category })
    .eq('workspace_id', workspaceId).eq('category_rule_id', ruleId).eq('category_source', 'rule');
  if (itemsError) fail('Não foi possível atualizar os lançamentos da regra', itemsError);
}

/**
 * Exclui a regra. `revertItems`: tira a categoria dos lançamentos que a regra
 * aplicou (voltam a "sem categoria"); senão eles ficam como categoria sua.
 * Lançamentos confirmados por você nunca são tocados.
 */
export async function deleteCategoryRule(supabase: SupabaseClient, workspaceId: string, ruleId: string, revertItems: boolean): Promise<void> {
  const patch = revertItems
    ? { category: null, category_source: null, category_rule_id: null }
    : { category_source: 'user', category_rule_id: null };
  const { error: itemsError } = await supabase.from('finance_invoice_items').update(patch)
    .eq('workspace_id', workspaceId).eq('category_rule_id', ruleId).eq('category_source', 'rule');
  if (itemsError) fail('Não foi possível atualizar os lançamentos da regra', itemsError);
  const { error } = await supabase.from('finance_category_rules').delete().eq('workspace_id', workspaceId).eq('id', ruleId);
  if (error) fail('Não foi possível excluir a regra', error);
}

/** Quantos lançamentos a regra aplicou (para avisar antes de excluir). */
export async function countRuleItems(supabase: SupabaseClient, workspaceId: string, ruleId: string): Promise<number> {
  const { count, error } = await supabase.from('finance_invoice_items').select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId).eq('category_rule_id', ruleId).eq('category_source', 'rule');
  if (error) fail('Não foi possível contar os lançamentos da regra', error);
  return count ?? 0;
}

/**
 * Aprende com as escolhas confirmadas do usuário (ver category-learning-policy):
 * cria/ajusta/remove regras. Idempotente; nunca toca em categorias confirmadas.
 * Melhor esforço: sem as colunas de proveniência (migration pendente) não faz nada.
 */
export async function learnFromConfirmedChoices(supabase: SupabaseClient, workspaceId: string): Promise<void> {
  const { data, error } = await supabase.from('finance_invoice_items')
    .select('id, base_description, amount_cents, category, category_source, category_rule_id')
    .eq('workspace_id', workspaceId).neq('status', 'removed').neq('kind', 'payment');
  if (error) {
    if (error.code && MISSING_SCHEMA.has(error.code)) return;
    fail('Não foi possível aprender com as categorias', error);
  }
  const items: LearnableItem[] = (data ?? []).filter((r: Row) => r.category !== null && r.category !== undefined).map((r: Row) => ({
    id: r.id, baseDescription: r.base_description, amountCents: Number(r.amount_cents), category: r.category,
    categorySource: r.category_source ?? null, categoryRuleId: r.category_rule_id ?? null,
  }));
  if (items.length === 0) return;
  const rules = await listCategoryRules(supabase, workspaceId);
  const { data: cats, error: catError } = await supabase.from('finance_item_categories').select('id').eq('workspace_id', workspaceId);
  const valid = new Set<string>(catError || !cats || cats.length === 0 ? DEFAULT_CATEGORIES.map((c) => c.id) : cats.map((c: Row) => c.id as string));

  const plan = planLearning(items, rules, valid);
  for (const id of plan.remove) await deleteCategoryRule(supabase, workspaceId, id, false);
  for (const r of plan.retarget) await changeRuleCategory(supabase, workspaceId, r.ruleId, r.category);
  for (const c of plan.create) {
    try {
      await saveCategoryRule(supabase, workspaceId, c);
    } catch {
      // Corrida com outra aba criando a mesma regra: a chave única protege; ignora.
    }
  }
}

/**
 * Aplica as regras aos lançamentos SEM categoria. Idempotente: a guarda
 * `category IS NULL` no próprio UPDATE impede qualquer sobrescrita, mesmo sob
 * concorrência. Devolve quantos lançamentos foram classificados.
 */
export async function applyCategoryRules(supabase: SupabaseClient, workspaceId: string): Promise<number> {
  await learnFromConfirmedChoices(supabase, workspaceId);
  const rules = await listCategoryRules(supabase, workspaceId);
  if (rules.length === 0) return 0;
  const { data, error } = await supabase.from('finance_invoice_items')
    .select('id, base_description, amount_cents, category, kind, status')
    .eq('workspace_id', workspaceId).is('category', null).neq('status', 'removed').neq('kind', 'payment');
  if (error) fail('Não foi possível aplicar as regras', error);
  const targets: RuleTarget[] = (data ?? []).map((r: Row) => ({
    id: r.id, baseDescription: r.base_description, amountCents: Number(r.amount_cents), category: r.category ?? null, kind: r.kind, status: r.status,
  }));
  const plan = planRuleApplication(targets, rules);
  const groups = new Map<string, { category: string; ruleId: string; ids: string[] }>();
  for (const a of plan) {
    const key = `${a.ruleId}|${a.category}`;
    const g = groups.get(key) ?? { category: a.category, ruleId: a.ruleId, ids: [] };
    g.ids.push(a.itemId);
    groups.set(key, g);
  }
  let applied = 0;
  for (const g of groups.values()) {
    for (let i = 0; i < g.ids.length; i += 200) {
      const chunk = g.ids.slice(i, i + 200);
      const { data: updated, error: updateError } = await supabase.from('finance_invoice_items')
        .update({ category: g.category, category_source: 'rule', category_rule_id: g.ruleId })
        .eq('workspace_id', workspaceId).in('id', chunk).is('category', null).select('id');
      if (updateError) fail('Não foi possível aplicar as regras', updateError);
      applied += updated?.length ?? 0;
    }
  }
  return applied;
}

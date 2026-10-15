import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_CATEGORIES, type Category } from '../domain/categories';
import { CategoryLearningError } from './category-learning';

/**
 * CRUD das categorias do workspace (fonte única: `finance_item_categories`).
 * Tudo sob RLS do usuário, sempre filtrando por workspace. Nada aqui toca em
 * valores, datas ou vínculos: só o rótulo de categoria dos lançamentos.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const MISSING_SCHEMA = new Set(['42P01', 'PGRST205', '42703']);
const isMissing = (e: { code?: string } | null) => Boolean(e?.code && MISSING_SCHEMA.has(e.code));

function fail(context: string, error: { message: string; code?: string }): never {
  console.error(`[finance-categories] ${context}`, error.code ?? '');
  throw new CategoryLearningError(`${context}. Tente novamente.`);
}

export interface CategoriesResult {
  categories: Category[];
  /** false = antes da migration: lista inicial em memória (somente leitura). */
  persisted: boolean;
}

const toCategory = (r: Row): Category => ({ id: r.id, label: r.label });

/**
 * Lista as categorias do workspace. Na primeira leitura semeia a lista inicial
 * (idempotente: duas abas semeando juntas não duplicam). Depois de semeada, a
 * lista é do usuário; excluir tudo não recria nada. Antes da migration devolve
 * a lista inicial em memória, sem quebrar a tela.
 */
export async function listCategories(supabase: SupabaseClient, workspaceId: string): Promise<CategoriesResult> {
  const read = () => supabase.from('finance_item_categories').select('id, label')
    .eq('workspace_id', workspaceId).order('sort_order').order('created_at');
  let { data, error } = await read();
  if (error) {
    if (isMissing(error)) return { categories: [...DEFAULT_CATEGORIES], persisted: false };
    fail('Não foi possível carregar as categorias', error);
  }
  if ((data ?? []).length === 0) {
    const { data: seeded, error: seedReadError } = await supabase.from('finance_category_seed').select('workspace_id')
      .eq('workspace_id', workspaceId).maybeSingle();
    if (seedReadError) fail('Não foi possível carregar as categorias', seedReadError);
    if (!seeded) {
      const rows = DEFAULT_CATEGORIES.map((c, i) => ({ workspace_id: workspaceId, id: c.id, label: c.label, sort_order: i }));
      const { error: upsertError } = await supabase.from('finance_item_categories')
        .upsert(rows, { onConflict: 'workspace_id,id', ignoreDuplicates: true });
      if (upsertError) fail('Não foi possível preparar as categorias', upsertError);
      await supabase.from('finance_category_seed').upsert({ workspace_id: workspaceId }, { onConflict: 'workspace_id', ignoreDuplicates: true });
      ({ data, error } = await read());
      if (error) fail('Não foi possível carregar as categorias', error);
    }
  }
  return { categories: (data ?? []).map(toCategory), persisted: true };
}

export async function createCategory(supabase: SupabaseClient, workspaceId: string, c: Category): Promise<void> {
  const { data: last } = await supabase.from('finance_item_categories').select('sort_order')
    .eq('workspace_id', workspaceId).order('sort_order', { ascending: false }).limit(1);
  const sortOrder = ((last?.[0]?.sort_order as number | undefined) ?? -1) + 1;
  const { error } = await supabase.from('finance_item_categories')
    .insert({ workspace_id: workspaceId, id: c.id, label: c.label.trim(), sort_order: sortOrder });
  if (error) {
    if (error.code === '23505') throw new CategoryLearningError('Já existe uma categoria com esse nome.');
    fail('Não foi possível criar a categoria', error);
  }
}

/** Renomear muda só o nome exibido: o id (usado por lançamentos e regras) não muda. */
export async function renameCategory(supabase: SupabaseClient, workspaceId: string, id: string, label: string): Promise<void> {
  const { error } = await supabase.from('finance_item_categories').update({ label: label.trim() })
    .eq('workspace_id', workspaceId).eq('id', id);
  if (error) {
    if (error.code === '23505') throw new CategoryLearningError('Já existe uma categoria com esse nome.');
    fail('Não foi possível renomear a categoria', error);
  }
}

/** Quantos lançamentos (faturas e despesas pontuais) usam a categoria. */
export async function countCategoryUse(supabase: SupabaseClient, workspaceId: string, id: string): Promise<number> {
  const { count, error } = await supabase.from('finance_invoice_items').select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId).eq('category', id).neq('status', 'removed');
  if (error) fail('Não foi possível contar os lançamentos da categoria', error);
  const { count: expenses, error: expensesError } = await supabase.from('finance_expenses').select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId).eq('category', id);
  if (expensesError && !isMissing(expensesError)) fail('Não foi possível contar as despesas da categoria', expensesError);
  return (count ?? 0) + (expenses ?? 0);
}

/**
 * Exclui a categoria. Escolher substituta é OPCIONAL e explícito:
 *  - com substituta: lançamentos (e regras) passam para ela, como escolha sua;
 *  - sem substituta: lançamentos ficam "Sem categoria" e as regras da categoria
 *    são excluídas (nunca ficam apontando para algo que não existe).
 * Valores, datas e demais campos não são tocados. Ordem segura para repetir
 * em caso de falha: lançamentos, regras e, por último, a categoria.
 */
export async function deleteCategory(supabase: SupabaseClient, workspaceId: string, id: string, replacementId: string | null): Promise<void> {
  if (replacementId === id) throw new CategoryLearningError('A categoria substituta deve ser outra.');
  const itemPatch = replacementId
    ? { category: replacementId, category_source: 'user', category_rule_id: null }
    : { category: null, category_source: null, category_rule_id: null };
  const { error: itemsError } = await supabase.from('finance_invoice_items').update(itemPatch)
    .eq('workspace_id', workspaceId).eq('category', id);
  if (itemsError) fail('Não foi possível atualizar os lançamentos da categoria', itemsError);
  const { error: expensesError } = await supabase.from('finance_expenses').update({ category: replacementId })
    .eq('workspace_id', workspaceId).eq('category', id);
  if (expensesError && !isMissing(expensesError)) fail('Não foi possível atualizar as despesas da categoria', expensesError);
  if (replacementId) {
    const { error } = await supabase.from('finance_category_rules').update({ category: replacementId })
      .eq('workspace_id', workspaceId).eq('category', id);
    if (error) fail('Não foi possível atualizar as regras da categoria', error);
  } else {
    const { error } = await supabase.from('finance_category_rules').delete()
      .eq('workspace_id', workspaceId).eq('category', id);
    if (error) fail('Não foi possível excluir as regras da categoria', error);
  }
  const { error } = await supabase.from('finance_item_categories').delete()
    .eq('workspace_id', workspaceId).eq('id', id);
  if (error) fail('Não foi possível excluir a categoria', error);
}

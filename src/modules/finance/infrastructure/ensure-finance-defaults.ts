import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_FINANCE_CATEGORIES } from '../domain/finance-category.schema';
import { DEFAULT_FINANCE_SOURCES } from '../domain/finance-source.schema';
import type { FinanceCategoryRow, FinanceSettingsRow, FinanceSourceRow } from './finance-row-mappers';

export interface EnsureFinanceDefaultsRawResult {
  settings: FinanceSettingsRow;
  categories: FinanceCategoryRow[];
  sources: FinanceSourceRow[];
  createdCategories: FinanceCategoryRow[];
  createdSources: FinanceSourceRow[];
  createdSettings: boolean;
}

/**
 * Núcleo idempotente de inicialização do módulo (categorias, origens de
 * cartão, configuração) — função pura de `(SupabaseClient, workspaceId)`,
 * sem `ChangeNotifier`, reaproveitável pelo repositório do cliente e por
 * qualquer rota de servidor futura (mesmo padrão de
 * `ensure-default-shopping-lists.ts`). Abrir `/financas` várias vezes nunca
 * duplica nada: `upsert(..., { ignoreDuplicates: true })` só retorna as
 * linhas efetivamente criadas nesta chamada.
 */
export async function ensureFinanceDefaults(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<EnsureFinanceDefaultsRawResult> {
  const categoryRows = DEFAULT_FINANCE_CATEGORIES.map((c) => ({
    workspace_id: workspaceId,
    slug: c.slug,
    name: c.name,
    position: c.position,
  }));
  const { data: createdCategories, error: categoriesUpsertError } = await supabase
    .from('finance_categories')
    .upsert(categoryRows, { onConflict: 'workspace_id,slug', ignoreDuplicates: true })
    .select();
  if (categoriesUpsertError) {
    throw new Error(`Não foi possível preparar as categorias financeiras: ${categoriesUpsertError.message}`);
  }

  const sourceRows = DEFAULT_FINANCE_SOURCES.map((s) => ({
    workspace_id: workspaceId,
    name: s.name,
    kind: s.kind,
  }));
  const { data: createdSources, error: sourcesUpsertError } = await supabase
    .from('finance_sources')
    .upsert(sourceRows, { onConflict: 'workspace_id,name', ignoreDuplicates: true })
    .select();
  if (sourcesUpsertError) {
    throw new Error(`Não foi possível preparar as origens financeiras: ${sourcesUpsertError.message}`);
  }

  const { data: existingSettings, error: settingsSelectError } = await supabase
    .from('finance_settings')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (settingsSelectError) {
    throw new Error(`Não foi possível carregar a configuração financeira: ${settingsSelectError.message}`);
  }

  let settingsRow = existingSettings as FinanceSettingsRow | null;
  let createdSettings = false;
  if (!settingsRow) {
    const { data: insertedSettings, error: settingsInsertError } = await supabase
      .from('finance_settings')
      .insert({ workspace_id: workspaceId, default_matheus_income_cents: 0 })
      .select()
      .single();
    if (settingsInsertError) {
      // Corrida: outra requisição pode ter criado a linha entre o select e o
      // insert (unique(workspace_id) rejeita a segunda) — busca de novo em
      // vez de propagar o erro de conflito.
      const { data: retrySettings, error: retryError } = await supabase
        .from('finance_settings')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (retryError || !retrySettings) {
        throw new Error(`Não foi possível preparar a configuração financeira: ${settingsInsertError.message}`);
      }
      settingsRow = retrySettings as FinanceSettingsRow;
    } else {
      settingsRow = insertedSettings as FinanceSettingsRow;
      createdSettings = true;
    }
  }

  const { data: allCategories, error: allCategoriesError } = await supabase
    .from('finance_categories')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true });
  if (allCategoriesError) {
    throw new Error(`Não foi possível carregar as categorias financeiras: ${allCategoriesError.message}`);
  }

  const { data: allSources, error: allSourcesError } = await supabase
    .from('finance_sources')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true });
  if (allSourcesError) {
    throw new Error(`Não foi possível carregar as origens financeiras: ${allSourcesError.message}`);
  }

  return {
    settings: settingsRow,
    categories: (allCategories ?? []) as FinanceCategoryRow[],
    sources: (allSources ?? []) as FinanceSourceRow[],
    createdCategories: (createdCategories ?? []) as FinanceCategoryRow[],
    createdSources: (createdSources ?? []) as FinanceSourceRow[],
    createdSettings,
  };
}

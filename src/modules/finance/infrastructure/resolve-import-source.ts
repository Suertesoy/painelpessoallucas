import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImportSourceProfile } from '../domain/source-resolution';
import type { FinanceSourceKind } from '../domain/finance-source.schema';

export interface ResolvedImportSource {
  id: string;
  kind: FinanceSourceKind;
  name: string;
}

/**
 * Busca-ou-cria a origem interna correspondente ao perfil detectado (nome
 * estável e determinístico — nunca escolhido pelo usuário, seção 6 do
 * pedido). Idempotente: `unique(workspace_id, name)` garante que uma
 * corrida entre duas requisições concorrentes nunca cria duas origens para
 * o mesmo perfil — a perdedora busca de novo e devolve o resultado da
 * vencedora, mesmo padrão de `confirm-finance-import`/`create-finance-import`.
 */
export async function resolveImportSource(
  supabase: SupabaseClient,
  workspaceId: string,
  profile: ImportSourceProfile
): Promise<ResolvedImportSource> {
  const { data: existing, error: selectError } = await supabase
    .from('finance_sources')
    .select('id, kind, name')
    .eq('workspace_id', workspaceId)
    .eq('name', profile.name)
    .maybeSingle();
  if (selectError) throw new Error(`Não foi possível resolver a origem da importação: ${selectError.message}`);
  if (existing) return existing as ResolvedImportSource;

  const { data: inserted, error: insertError } = await supabase
    .from('finance_sources')
    .insert({ workspace_id: workspaceId, name: profile.name, kind: profile.kind, provider: profile.provider, status: 'active' })
    .select('id, kind, name')
    .single();
  if (insertError) {
    if (insertError.code === '23505') {
      const { data: race } = await supabase
        .from('finance_sources')
        .select('id, kind, name')
        .eq('workspace_id', workspaceId)
        .eq('name', profile.name)
        .maybeSingle();
      if (race) return race as ResolvedImportSource;
    }
    throw new Error(`Não foi possível criar a origem da importação: ${insertError.message}`);
  }
  return inserted as ResolvedImportSource;
}

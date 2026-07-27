import type { SupabaseClient } from '@supabase/supabase-js';
import { sha256Hex } from '@/lib/text-hash';

export type TriageFreshnessResult =
  | { fresh: true }
  | { fresh: false; reason: 'not_found' | 'not_completed' | 'stale' };

/**
 * Confere se a análise de IA (ai_runs) indicada ainda corresponde ao
 * conteúdo ATUAL da captura — ou seja, se a transcrição não foi editada
 * depois que a análise rodou. `ai_runs.input_hash` já é gravado em
 * /api/ai/triage-capture; aqui só comparamos com o hash do conteúdo atual.
 *
 * Usada nas duas rotas que aplicam uma proposta gerada por IA
 * (confirm-triage-action, confirm-calendar-event) para garantir, no
 * servidor, que uma proposta desatualizada nunca é confirmada — checar isso
 * só no cliente não é suficiente.
 */
export async function checkTriageFreshness(
  supabase: SupabaseClient,
  params: { aiRunId: string; itemId: string; workspaceId: string; currentContent: string }
): Promise<TriageFreshnessResult> {
  const { data: run, error } = await supabase
    .from('ai_runs')
    .select('id, item_id, status, input_hash')
    .eq('id', params.aiRunId)
    .eq('workspace_id', params.workspaceId)
    .maybeSingle();

  if (error || !run || run.item_id !== params.itemId) {
    return { fresh: false, reason: 'not_found' };
  }
  if (run.status !== 'completed') {
    return { fresh: false, reason: 'not_completed' };
  }

  const currentHash = await sha256Hex(params.currentContent);
  if (currentHash !== run.input_hash) {
    return { fresh: false, reason: 'stale' };
  }
  return { fresh: true };
}

export const STALE_ANALYSIS_MESSAGE =
  'A transcrição mudou depois desta análise. Analise novamente antes de confirmar as ações.';

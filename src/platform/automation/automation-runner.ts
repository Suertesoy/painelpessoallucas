import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Executor idempotente de trabalhos de automação.
 *
 * A idempotência vem do banco (unique workspace_id + automation_type +
 * idempotency_key), nunca da memória da função:
 * - completed → nunca reexecuta
 * - running recente (< 15 min) → assume em andamento, pula
 * - failed com attempt < MAX_ATTEMPTS → tenta de novo
 */

export const MAX_ATTEMPTS = 3;
const RUNNING_STALE_MS = 15 * 60 * 1000;

export interface JobOutcome {
  status: 'completed' | 'failed' | 'skipped';
  attempt?: number;
  error?: string;
  result?: unknown;
}

export async function runIdempotentJob(
  admin: SupabaseClient,
  workspaceId: string,
  automationType: string,
  idempotencyKey: string,
  scheduledFor: string | null,
  input: Record<string, unknown> | null,
  job: () => Promise<unknown>
): Promise<JobOutcome> {
  // 1. Estado atual do trabalho.
  const { data: existing } = await admin
    .from('automation_runs')
    .select('id, status, attempt, started_at')
    .eq('workspace_id', workspaceId)
    .eq('automation_type', automationType)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'completed' || existing.status === 'skipped') {
      return { status: 'skipped' };
    }
    if (existing.status === 'running') {
      const startedAt = existing.started_at ? new Date(existing.started_at).getTime() : 0;
      if (Date.now() - startedAt < RUNNING_STALE_MS) {
        return { status: 'skipped' };
      }
      // running velho: considera travado e tenta de novo (attempt conta).
    }
    if (existing.status === 'failed' && existing.attempt >= MAX_ATTEMPTS) {
      return { status: 'skipped' };
    }
  }

  const attempt = (existing?.attempt ?? 0) + 1;

  // 2. Reivindica o trabalho (insert único ou update do registro existente).
  if (!existing) {
    const { error: claimError } = await admin.from('automation_runs').insert({
      workspace_id: workspaceId,
      automation_type: automationType,
      idempotency_key: idempotencyKey,
      scheduled_for: scheduledFor,
      status: 'running',
      attempt,
      started_at: new Date().toISOString(),
      input,
    });
    if (claimError) {
      // Conflito com execução concorrente: outro tick reivindicou primeiro.
      return { status: 'skipped' };
    }
  } else {
    const { error: updateError } = await admin
      .from('automation_runs')
      .update({
        status: 'running',
        attempt,
        started_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .in('status', ['failed', 'running', 'queued']);
    if (updateError) {
      return { status: 'skipped' };
    }
  }

  // 3. Executa.
  try {
    const result = await job();
    await admin
      .from('automation_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        result: result == null ? null : JSON.parse(JSON.stringify(result)),
        error_code: null,
        error_message: null,
      })
      .eq('workspace_id', workspaceId)
      .eq('automation_type', automationType)
      .eq('idempotency_key', idempotencyKey);
    return { status: 'completed', attempt, result };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'erro desconhecido';
    await admin
      .from('automation_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_code: 'job_error',
        error_message: message.slice(0, 500),
      })
      .eq('workspace_id', workspaceId)
      .eq('automation_type', automationType)
      .eq('idempotency_key', idempotencyKey);
    return { status: 'failed', attempt, error: message };
  }
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/platform/supabase/session';
import {
  AUDIO_TRIAGE_PROMPT_VERSION,
  resolveAudioTriageStructurer,
  type ProjectContext,
} from '@/platform/ai/audio-triage-structurer';
import { OpenAIAudioTriageStructurer, getTriageModel } from '@/platform/ai/openai-audio-triage-structurer';
import { checkRateLimit } from '@/platform/ai/rate-limit';
import { estimateCostUsd } from '@/platform/ai/openai-plan-structurer';
import type { AudioTriageProposal } from '@/platform/ai/audio-triage.schema';

/**
 * POST /api/ai/triage-capture  { itemId, idempotencyKey? }
 * Analisa a transcrição de uma captura (já salva na Caixa de Entrada) e
 * devolve uma PROPOSTA — nunca cria, edita, conclui, arquiva ou agenda nada.
 * A captura já existe antes desta rota rodar; se a IA falhar, a captura
 * continua intacta (esta rota nunca apaga nem altera o item).
 */

export const maxDuration = 60;

const BodySchema = z.object({
  itemId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(200).optional(),
});

const RATE_LIMIT_MAX_PER_HOUR = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_CONTEXT_PROJECTS = 15;
const MAX_RECENT_ITEMS = 10;

// Evita reprocessar a mesma captura em cliques duplicados (idempotência
// simples em memória — mesma limitação documentada em rate-limit.ts).
const recentTriageKeys = new Map<string, number>();
const IDEMPOTENCY_WINDOW_MS = 60_000;

function selectRelevantProjects(
  transcript: string,
  projects: ProjectContext[]
): ProjectContext[] {
  if (projects.length <= MAX_CONTEXT_PROJECTS) return projects;

  const words = transcript
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 3);
  const wordSet = new Set(words);

  const scored = projects.map((p) => {
    const haystack = `${p.name} ${p.objective ?? ''} ${p.nextMilestone ?? ''}`.toLowerCase();
    let score = 0;
    for (const w of wordSet) {
      if (haystack.includes(w)) score += 1;
    }
    return { project: p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_CONTEXT_PROJECTS).map((s) => s.project);
}

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  if (!checkRateLimit(`ai-triage:${session.user.id}`, RATE_LIMIT_MAX_PER_HOUR, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json(
      { error: 'Muitas análises em pouco tempo. Tente novamente em instantes.' },
      { status: 429 }
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido' }, { status: 400 });
  }

  if (body.idempotencyKey) {
    const dedupeKey = `${session.workspaceId}:${body.idempotencyKey}`;
    const last = recentTriageKeys.get(dedupeKey);
    if (last && Date.now() - last < IDEMPOTENCY_WINDOW_MS) {
      return NextResponse.json(
        { error: 'Esta captura já está sendo analisada. Aguarde o resultado.' },
        { status: 409 }
      );
    }
    recentTriageKeys.set(dedupeKey, Date.now());
  }

  // Item sob RLS: só encontra se pertencer ao workspace do usuário.
  const { data: item, error: itemError } = await session.supabase
    .from('items')
    .select('id, workspace_id, content, title')
    .eq('id', body.itemId)
    .is('deleted_at', null)
    .maybeSingle();
  if (itemError || !item) {
    return NextResponse.json({ error: 'Captura não encontrada' }, { status: 404 });
  }
  const transcript: string = item.content ?? item.title ?? '';
  if (!transcript.trim()) {
    return NextResponse.json({ error: 'Captura sem conteúdo para analisar' }, { status: 400 });
  }

  // Contexto: projetos ativos (todos, se poucos; senão, os mais relevantes por texto).
  const { data: projectRows } = await session.supabase
    .from('projects')
    .select('id, name, objective, description, next_milestone')
    .eq('workspace_id', session.workspaceId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  const allProjects: ProjectContext[] = (projectRows ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    objective: p.objective ?? undefined,
    description: p.description ?? undefined,
    nextMilestone: p.next_milestone ?? undefined,
  }));
  const projects = selectRelevantProjects(transcript, allProjects);

  const { data: recentItemRows } = await session.supabase
    .from('items')
    .select('title, type')
    .eq('workspace_id', session.workspaceId)
    .neq('id', body.itemId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(MAX_RECENT_ITEMS);
  const recentItems = (recentItemRows ?? [])
    .filter((r) => r.title)
    .map((r) => ({ title: r.title as string, type: r.type as string }));

  // Hash do input para auditoria (nunca a transcrição bruta em texto plano no log).
  const inputHash = await sha256Hex(transcript);

  const { data: aiRun, error: aiRunError } = await session.supabase
    .from('ai_runs')
    .insert({
      workspace_id: session.workspaceId,
      item_id: body.itemId,
      provider: 'openai',
      model: getTriageModel(),
      operation: 'audio_capture_triage',
      prompt_version: AUDIO_TRIAGE_PROMPT_VERSION,
      input_hash: inputHash,
      status: 'queued',
    })
    .select('id')
    .single();
  if (aiRunError || !aiRun) {
    return NextResponse.json(
      { error: `Falha ao registrar execução de IA: ${aiRunError?.message}` },
      { status: 500 }
    );
  }

  const startedAt = Date.now();
  await session.supabase
    .from('ai_runs')
    .update({ status: 'running', started_at: new Date(startedAt).toISOString() })
    .eq('id', aiRun.id);

  let proposal: AudioTriageProposal;
  let usage: { model: string; inputTokens?: number; outputTokens?: number };
  try {
    const structurer = resolveAudioTriageStructurer(() => new OpenAIAudioTriageStructurer());
    const result = await structurer.triage({
      transcript,
      nowIso: new Date().toISOString(),
      timezone: 'America/Sao_Paulo',
      projects,
      recentItems,
    });
    proposal = result.proposal;
    usage = result.usage;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro desconhecido na IA';
    await session.supabase
      .from('ai_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        latency_ms: Date.now() - startedAt,
        error_code: 'ai_error',
        error_message: message.slice(0, 500),
      })
      .eq('id', aiRun.id);
    // A captura (item) nunca é tocada aqui — continua intacta na Caixa de Entrada.
    return NextResponse.json(
      { error: `A análise por IA falhou: ${message}. Sua captura continua salva.` },
      { status: 502 }
    );
  }

  const latency = Date.now() - startedAt;
  await session.supabase
    .from('ai_runs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      latency_ms: latency,
      input_tokens: usage.inputTokens ?? null,
      output_tokens: usage.outputTokens ?? null,
      estimated_cost: estimateCostUsd(usage.model, usage.inputTokens, usage.outputTokens),
      response_metadata: proposal,
    })
    .eq('id', aiRun.id);

  return NextResponse.json({ aiRunId: aiRun.id, proposal, model: usage.model });
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

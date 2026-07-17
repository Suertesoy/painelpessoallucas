import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/platform/supabase/server-client';
import { OpenAIPlanStructurer, estimateCostUsd } from '@/platform/ai/openai-plan-structurer';
import { PROMPT_VERSION, resolvePlanStructurer } from '@/platform/ai/plan-structurer';
import type { PlanProposal } from '@/modules/plans/domain/plan-proposal.schema';

/**
 * POST /api/planos/processar
 * Estrutura um documento importado em uma proposta de plano (draft).
 *
 * Regras:
 * - Sessão obrigatória; o documento é carregado sob RLS (membro do workspace).
 * - ai_run registrado como queued → running → completed/failed.
 * - Falha da IA NUNCA apaga o documento original.
 * - O plano criado nasce como draft; nada é ativado sem aprovação explícita.
 */

const BodySchema = z.object({
  documentId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido' }, { status: 400 });
  }

  // Documento sob RLS: se não for membro do workspace, não encontra.
  const { data: doc, error: docError } = await supabase
    .from('source_documents')
    .select('*')
    .eq('id', body.documentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (docError || !doc) {
    return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 });
  }

  const workspaceId: string = doc.workspace_id;

  // Nome do projeto (contexto mínimo para o modelo).
  let projectName: string | undefined;
  if (doc.project_id) {
    const { data: project } = await supabase
      .from('projects')
      .select('name')
      .eq('id', doc.project_id)
      .maybeSingle();
    projectName = project?.name;
  }

  // Registra a execução como queued.
  const { data: aiRun, error: aiRunError } = await supabase
    .from('ai_runs')
    .insert({
      workspace_id: workspaceId,
      source_document_id: doc.id,
      provider: 'openai',
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      operation: 'plan_import',
      prompt_version: PROMPT_VERSION,
      input_hash: doc.content_hash,
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

  await supabase
    .from('source_documents')
    .update({ processing_status: 'processing' })
    .eq('id', doc.id);

  const startedAt = Date.now();
  await supabase
    .from('ai_runs')
    .update({ status: 'running', started_at: new Date(startedAt).toISOString() })
    .eq('id', aiRun.id);

  let proposal: PlanProposal;
  let usage: { model: string; inputTokens?: number; outputTokens?: number };
  try {
    const structurer = resolvePlanStructurer(() => new OpenAIPlanStructurer());
    const result = await structurer.structure({
      title: doc.title,
      documentType: doc.document_type,
      content: doc.original_content,
      projectName,
      startDate: body.startDate,
      timezone: 'America/Sao_Paulo',
    });
    proposal = result.proposal;
    usage = result.usage;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro desconhecido na IA';
    // Falha preserva o documento; apenas marca os status.
    await supabase
      .from('ai_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        latency_ms: Date.now() - startedAt,
        error_code: 'ai_error',
        error_message: message.slice(0, 500),
      })
      .eq('id', aiRun.id);
    await supabase
      .from('source_documents')
      .update({ processing_status: 'failed' })
      .eq('id', doc.id);
    return NextResponse.json(
      { error: `O processamento com IA falhou: ${message}. O documento original está preservado.` },
      { status: 502 }
    );
  }

  // ---------------------------------------------------------------------------
  // Materializa a PROPOSTA como plano draft (nada ativo, nada aprovado).
  // ---------------------------------------------------------------------------
  try {
    const planId = crypto.randomUUID();

    const { error: planError } = await supabase.from('execution_plans').insert({
      id: planId,
      workspace_id: workspaceId,
      project_id: doc.project_id,
      source_document_id: doc.id,
      name: proposal.planName,
      objective: proposal.objective,
      status: 'draft',
      start_date: body.startDate ?? null,
      target_date: null,
      timezone: 'America/Sao_Paulo',
      created_by: user.id,
    });
    if (planError) throw new Error(`plano: ${planError.message}`);

    // Fases (ids pré-gerados para vincular ações por índice).
    const phaseIds = proposal.phases.map(() => crypto.randomUUID());
    if (proposal.phases.length > 0) {
      const { error } = await supabase.from('plan_phases').insert(
        proposal.phases.map((phase, i) => ({
          id: phaseIds[i],
          workspace_id: workspaceId,
          execution_plan_id: planId,
          name: phase.name,
          description: phase.description,
          position: i,
          start_offset_days: phase.startOffsetDays,
          duration_days: phase.durationDays,
          milestone: phase.milestone,
          success_criteria: phase.successCriteria,
        }))
      );
      if (error) throw new Error(`fases: ${error.message}`);
    }

    // Regras de recorrência: das ações + rotinas diárias/semanais (inativas).
    type RuleInsert = Record<string, unknown>;
    const ruleRows: RuleInsert[] = [];

    const actionRuleIds: (string | null)[] = proposal.actions.map((action) => {
      if (!action.recurrence) return null;
      const id = crypto.randomUUID();
      ruleRows.push({
        id,
        workspace_id: workspaceId,
        execution_plan_id: planId,
        frequency: action.recurrence.frequency,
        interval: action.recurrence.interval,
        days_of_week: action.recurrence.daysOfWeek,
        day_of_month: action.recurrence.dayOfMonth,
        local_time: action.recurrence.localTime,
        timezone: 'America/Sao_Paulo',
        is_active: false,
      });
      return id;
    });

    const routineEntries = [
      ...proposal.dailyRoutines.map((r) => ({ routine: r, frequency: 'daily' as const })),
      ...proposal.weeklyRoutines.map((r) => ({ routine: r, frequency: 'weekly' as const })),
    ];
    const routineRuleIds = routineEntries.map(({ routine, frequency }) => {
      const id = crypto.randomUUID();
      ruleRows.push({
        id,
        workspace_id: workspaceId,
        execution_plan_id: planId,
        frequency,
        interval: 1,
        days_of_week: routine.daysOfWeek,
        day_of_month: null,
        local_time: routine.localTime,
        timezone: 'America/Sao_Paulo',
        is_active: false,
      });
      return id;
    });

    if (ruleRows.length > 0) {
      const { error } = await supabase.from('recurrence_rules').insert(ruleRows);
      if (error) throw new Error(`recorrências: ${error.message}`);
    }

    // Ações (dependências por índice → UUIDs pré-gerados).
    const actionIds = proposal.actions.map(() => crypto.randomUUID());
    const actionRows = proposal.actions.map((action, i) => ({
      id: actionIds[i],
      workspace_id: workspaceId,
      execution_plan_id: planId,
      phase_id:
        action.phaseIndex != null && action.phaseIndex < phaseIds.length
          ? phaseIds[action.phaseIndex]
          : null,
      title: action.title,
      description: action.description,
      action_type: action.actionType,
      priority: action.priority,
      estimated_minutes: action.estimatedMinutes,
      due_rule: action.suggestedDue ? { type: 'fixed', date: action.suggestedDue } : null,
      schedule_rule: action.suggestedStart ? { suggestedStart: action.suggestedStart } : null,
      recurrence_rule_id: actionRuleIds[i],
      dependency_action_ids: action.dependencies
        .filter((d) => d >= 0 && d < actionIds.length && d !== i)
        .map((d) => actionIds[d]),
      waiting_on: action.waitingOn,
      requires_confirmation: action.needsConfirmation,
      position: i,
    }));

    // Rotinas viram ações do tipo routine vinculadas às regras.
    const routineRows = routineEntries.map(({ routine }, i) => ({
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      execution_plan_id: planId,
      phase_id: null,
      title: routine.title,
      description: null,
      action_type: 'routine',
      priority: 'normal',
      estimated_minutes: routine.estimatedMinutes,
      due_rule: null,
      schedule_rule: routine.localTime ? { time: routine.localTime } : null,
      recurrence_rule_id: routineRuleIds[i],
      dependency_action_ids: [],
      waiting_on: null,
      requires_confirmation: false,
      position: actionRows.length + i,
    }));

    const allActionRows = [...actionRows, ...routineRows];
    if (allActionRows.length > 0) {
      const { error } = await supabase.from('plan_actions').insert(allActionRows);
      if (error) throw new Error(`ações: ${error.message}`);
    }

    // Conclui o ai_run com métricas + proposta validada (para a revisão).
    const latency = Date.now() - startedAt;
    await supabase
      .from('ai_runs')
      .update({
        status: 'completed',
        execution_plan_id: planId,
        completed_at: new Date().toISOString(),
        latency_ms: latency,
        input_tokens: usage.inputTokens ?? null,
        output_tokens: usage.outputTokens ?? null,
        estimated_cost: estimateCostUsd(usage.model, usage.inputTokens, usage.outputTokens),
        response_metadata: proposal,
      })
      .eq('id', aiRun.id);

    await supabase
      .from('source_documents')
      .update({ processing_status: 'completed' })
      .eq('id', doc.id);

    // Evento de domínio.
    await supabase.from('domain_events').insert({
      workspace_id: workspaceId,
      type: 'execution_plan.draft_created',
      entity_id: planId,
      source: 'ai',
      payload: { sourceDocumentId: doc.id, aiRunId: aiRun.id, confidence: proposal.confidence },
    });

    return NextResponse.json({ planId, aiRunId: aiRun.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'erro desconhecido';
    await supabase
      .from('ai_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        latency_ms: Date.now() - startedAt,
        error_code: 'persist_error',
        error_message: message.slice(0, 500),
      })
      .eq('id', aiRun.id);
    await supabase
      .from('source_documents')
      .update({ processing_status: 'failed' })
      .eq('id', doc.id);
    return NextResponse.json(
      { error: `Falha ao salvar a proposta (${message}). O documento original está preservado.` },
      { status: 500 }
    );
  }
}

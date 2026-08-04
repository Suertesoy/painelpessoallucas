import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/platform/supabase/server-client';
import { OpenAIPlanStructurer, estimateCostUsd } from '@/platform/ai/openai-plan-structurer';
import { PROMPT_VERSION, resolvePlanStructurer } from '@/platform/ai/plan-structurer';
import { PlanProposalSchema, type PlanProposal } from '@/modules/plans/domain/plan-proposal.schema';

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
  /**
   * Reprocessamento explícito: descarta a resposta idempotente padrão e
   * chama a IA de novo para o mesmo documento, mesmo já havendo um draft
   * concluído (ex.: draft legado criado antes de uma correção no prompt).
   * Nunca duplica plano visível nem perde o source_document — ver bloco
   * abaixo.
   */
  force: z.boolean().optional(),
});

/** Planos que ainda não têm execução real comprometida — seguros para arquivar num reprocessamento. */
const REPROCESSABLE_STATUSES = new Set(['draft', 'awaiting_review', 'archived']);

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

  // ---------------------------------------------------------------------------
  // Recuperação idempotente: reprocessar o mesmo documento (retry manual, reload
  // durante o processamento anterior, requisição duplicada) nunca duplica plano
  // nem ai_run. Se o processamento anterior já concluiu, devolve o plano
  // existente; se ainda está em andamento (recente), pede para aguardar em vez
  // de disparar uma segunda chamada de IA em paralelo.
  // ---------------------------------------------------------------------------
  if (doc.processing_status === 'completed' && !body.force) {
    const { data: existingPlan } = await supabase
      .from('execution_plans')
      .select('id')
      .eq('source_document_id', doc.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingPlan) {
      const { data: latestRun } = await supabase
        .from('ai_runs')
        .select('id')
        .eq('execution_plan_id', existingPlan.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return NextResponse.json({ planId: existingPlan.id, aiRunId: latestRun?.id ?? null });
    }
  }

  // ---------------------------------------------------------------------------
  // Reprocessamento explícito (force): um documento já processado (ex.: draft
  // legado criado antes de uma correção no prompt/schema) pode ser reenviado à
  // IA sem duplicar plano. Planos ainda não comprometidos (draft/
  // awaiting_review/archived) são arquivados — nunca apagados, nunca perdem o
  // source_document — para abrir espaço a um novo draft. Um plano já aprovado/
  // ativo/pausado/concluído nunca é reprocessado automaticamente: teria items
  // já materializados dependendo dele.
  // ---------------------------------------------------------------------------
  if (doc.processing_status === 'completed' && body.force) {
    const { data: existingPlans, error: existingPlansError } = await supabase
      .from('execution_plans')
      .select('id, status')
      .eq('source_document_id', doc.id)
      .is('deleted_at', null);
    if (existingPlansError) {
      return NextResponse.json(
        { error: `Falha ao verificar planos existentes: ${existingPlansError.message}` },
        { status: 500 }
      );
    }
    const blocking = (existingPlans ?? []).filter(
      (p) => !REPROCESSABLE_STATUSES.has(p.status as string)
    );
    if (blocking.length > 0) {
      return NextResponse.json(
        {
          error:
            'Este documento já tem um plano aprovado ou em andamento. Não é possível reprocessar automaticamente — o plano atual já pode ter tarefas geradas a partir dele.',
        },
        { status: 409 }
      );
    }
    const toArchive = (existingPlans ?? []).filter((p) => p.status !== 'archived');
    for (const p of toArchive) {
      await supabase
        .from('execution_plans')
        .update({ status: 'archived' })
        .eq('id', p.id as string);
    }
  }

  const STALE_PROCESSING_MS = 3 * 60_000; // acima do timeout esperado da IA (2 min)
  if (
    doc.processing_status === 'processing' &&
    Date.now() - new Date(doc.updated_at).getTime() < STALE_PROCESSING_MS
  ) {
    return NextResponse.json(
      {
        error: 'Este documento já está sendo processado. Aguarde alguns instantes.',
        stillProcessing: true,
      },
      { status: 409 }
    );
  }

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
    // Segunda validação na fronteira, independente da implementação do
    // structurer: nenhuma proposta chega a plan_actions sem ter passado pelo
    // contrato Zod aqui, mesmo que um provider (ou um mock de teste) devolva
    // dado fora do formato esperado sem ter validado internamente.
    const validated = PlanProposalSchema.safeParse(result.proposal);
    if (!validated.success) {
      const issue = validated.error.issues[0];
      throw new Error(
        `A resposta da IA não segue o formato esperado (${issue?.path.join('.')}: ${issue?.message}).`
      );
    }
    proposal = validated.data;
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
    // due_rule/schedule_rule já vêm validados pelo PlanProposalSchema na
    // fronteira da IA (parsePlanProposal) — mesmo formato de PlanDateRuleSchema
    // do domínio, sem transformação ad-hoc que possa introduzir dado inválido.
    const actionIds = proposal.actions.map(() => crypto.randomUUID());
    const actionRows = proposal.actions.map((action, i) => {
      const schedule = action.suggestedSchedule;
      const scheduleRule =
        schedule && (schedule.dateRule || schedule.localTime)
          ? {
              ...(schedule.dateRule ? { dateRule: schedule.dateRule } : {}),
              ...(schedule.localTime ? { time: schedule.localTime } : {}),
            }
          : null;
      return {
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
        due_rule: action.suggestedDue,
        schedule_rule: scheduleRule,
        recurrence_rule_id: actionRuleIds[i],
        dependency_action_ids: action.dependencies
          .filter((d) => d >= 0 && d < actionIds.length && d !== i)
          .map((d) => actionIds[d]),
        waiting_on: action.waitingOn,
        requires_confirmation: action.needsConfirmation,
        position: i,
      };
    });

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

'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SourceDocument,
  SourceDocumentSchema,
  ExecutionPlan,
  ExecutionPlanSchema,
  PlanPhase,
  PlanPhaseSchema,
  PlanAction,
  PlanActionSchema,
  RecurrenceRule,
  RecurrenceRuleSchema,
  PlanDetail,
} from '../domain/plan.schema';
import {
  SourceDocumentRepository,
  ExecutionPlanRepository,
} from '../application/plan.repository';
import { PlanProposalSchema } from '../domain/plan-proposal.schema';
import { ChangeNotifier } from '@/platform/supabase/change-notifier';

// ----------------------------------------------------------------------------
// Mapeamentos linha ↔ domínio
// ----------------------------------------------------------------------------

type Row = Record<string, unknown>;

function docRowToDomain(row: Row): SourceDocument {
  return SourceDocumentSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id ?? undefined,
    title: row.title,
    documentType: row.document_type,
    originalContent: row.original_content,
    contentHash: row.content_hash,
    source: row.source,
    processingStatus: row.processing_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function planRowToDomain(row: Row): ExecutionPlan {
  return ExecutionPlanSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id ?? undefined,
    sourceDocumentId: row.source_document_id ?? undefined,
    name: row.name,
    objective: row.objective ?? undefined,
    status: row.status,
    startDate: row.start_date ?? undefined,
    targetDate: row.target_date ?? undefined,
    timezone: row.timezone ?? 'America/Sao_Paulo',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at ?? undefined,
  });
}

function phaseRowToDomain(row: Row): PlanPhase {
  return PlanPhaseSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    executionPlanId: row.execution_plan_id,
    name: row.name,
    description: row.description ?? undefined,
    position: row.position,
    startOffsetDays: row.start_offset_days ?? undefined,
    durationDays: row.duration_days ?? undefined,
    milestone: row.milestone ?? undefined,
    successCriteria: row.success_criteria ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function actionRowToDomain(row: Row): PlanAction {
  return PlanActionSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    executionPlanId: row.execution_plan_id,
    phaseId: row.phase_id ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    actionType: row.action_type,
    priority: row.priority,
    estimatedMinutes: row.estimated_minutes ?? undefined,
    dueRule: row.due_rule ?? undefined,
    scheduleRule: row.schedule_rule ?? undefined,
    recurrenceRuleId: row.recurrence_rule_id ?? undefined,
    dependencyActionIds: row.dependency_action_ids ?? [],
    waitingOn: row.waiting_on ?? undefined,
    requiresConfirmation: row.requires_confirmation ?? false,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function ruleRowToDomain(row: Row): RecurrenceRule {
  return RecurrenceRuleSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    executionPlanId: row.execution_plan_id ?? undefined,
    frequency: row.frequency,
    interval: row.interval ?? 1,
    daysOfWeek: row.days_of_week ?? undefined,
    dayOfMonth: row.day_of_month ?? undefined,
    localTime: row.local_time ?? undefined,
    timezone: row.timezone ?? 'America/Sao_Paulo',
    startAt: row.start_at ?? undefined,
    endAt: row.end_at ?? undefined,
    maxOccurrences: row.max_occurrences ?? undefined,
    nextOccurrenceAt: row.next_occurrence_at ?? undefined,
    lastOccurrenceAt: row.last_occurrence_at ?? undefined,
    isActive: row.is_active ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

// ----------------------------------------------------------------------------
// Repositórios
// ----------------------------------------------------------------------------

export class SupabaseSourceDocumentRepository implements SourceDocumentRepository {
  constructor(
    private supabase: SupabaseClient,
    private workspaceId: string,
    private notifier: ChangeNotifier
  ) {}

  async save(doc: SourceDocument): Promise<void> {
    const { error } = await this.supabase.from('source_documents').upsert(
      {
        id: doc.id,
        workspace_id: doc.workspaceId,
        project_id: doc.projectId ?? null,
        title: doc.title,
        document_type: doc.documentType,
        original_content: doc.originalContent,
        content_hash: doc.contentHash,
        source: doc.source,
        processing_status: doc.processingStatus,
        created_at: doc.createdAt,
      },
      { onConflict: 'id' }
    );
    if (error) throw new Error(`Não foi possível salvar o documento: ${error.message}`);
    this.notifier.notify();
  }

  async findById(id: string): Promise<SourceDocument | null> {
    const { data, error } = await this.supabase
      .from('source_documents')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível carregar o documento: ${error.message}`);
    return data ? docRowToDomain(data) : null;
  }

  async findAll(): Promise<SourceDocument[]> {
    const { data, error } = await this.supabase
      .from('source_documents')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Não foi possível carregar os documentos: ${error.message}`);
    return (data ?? []).map(docRowToDomain);
  }

  subscribe(listener: () => void): () => void {
    return this.notifier.subscribe(listener);
  }
}

export class SupabaseExecutionPlanRepository implements ExecutionPlanRepository {
  constructor(
    private supabase: SupabaseClient,
    private workspaceId: string,
    private notifier: ChangeNotifier
  ) {}

  async savePlan(plan: ExecutionPlan): Promise<void> {
    const { error } = await this.supabase.from('execution_plans').upsert(
      {
        id: plan.id,
        workspace_id: plan.workspaceId,
        project_id: plan.projectId ?? null,
        source_document_id: plan.sourceDocumentId ?? null,
        name: plan.name,
        objective: plan.objective ?? null,
        status: plan.status,
        start_date: plan.startDate ?? null,
        target_date: plan.targetDate ?? null,
        timezone: plan.timezone,
        created_at: plan.createdAt,
        approved_at: plan.approvedAt ?? null,
      },
      { onConflict: 'id' }
    );
    if (error) throw new Error(`Não foi possível salvar o plano: ${error.message}`);
    this.notifier.notify();
  }

  async savePhases(phases: PlanPhase[]): Promise<void> {
    if (phases.length === 0) return;
    const { error } = await this.supabase.from('plan_phases').upsert(
      phases.map((p) => ({
        id: p.id,
        workspace_id: p.workspaceId,
        execution_plan_id: p.executionPlanId,
        name: p.name,
        description: p.description ?? null,
        position: p.position,
        start_offset_days: p.startOffsetDays ?? null,
        duration_days: p.durationDays ?? null,
        milestone: p.milestone ?? null,
        success_criteria: p.successCriteria ?? null,
        created_at: p.createdAt,
      })),
      { onConflict: 'id' }
    );
    if (error) throw new Error(`Não foi possível salvar as fases: ${error.message}`);
    this.notifier.notify();
  }

  async saveActions(actions: PlanAction[]): Promise<void> {
    if (actions.length === 0) return;
    const { error } = await this.supabase.from('plan_actions').upsert(
      actions.map((a) => ({
        id: a.id,
        workspace_id: a.workspaceId,
        execution_plan_id: a.executionPlanId,
        phase_id: a.phaseId ?? null,
        title: a.title,
        description: a.description ?? null,
        action_type: a.actionType,
        priority: a.priority,
        estimated_minutes: a.estimatedMinutes ?? null,
        due_rule: a.dueRule ?? null,
        schedule_rule: a.scheduleRule ?? null,
        recurrence_rule_id: a.recurrenceRuleId ?? null,
        dependency_action_ids: a.dependencyActionIds,
        waiting_on: a.waitingOn ?? null,
        requires_confirmation: a.requiresConfirmation,
        position: a.position,
        created_at: a.createdAt,
      })),
      { onConflict: 'id' }
    );
    if (error) throw new Error(`Não foi possível salvar as ações: ${error.message}`);
    this.notifier.notify();
  }

  async saveRecurrenceRules(rules: RecurrenceRule[]): Promise<void> {
    if (rules.length === 0) return;
    const { error } = await this.supabase.from('recurrence_rules').upsert(
      rules.map((r) => ({
        id: r.id,
        workspace_id: r.workspaceId,
        execution_plan_id: r.executionPlanId ?? null,
        frequency: r.frequency,
        interval: r.interval,
        days_of_week: r.daysOfWeek ?? null,
        day_of_month: r.dayOfMonth ?? null,
        local_time: r.localTime ?? null,
        timezone: r.timezone,
        start_at: r.startAt ?? null,
        end_at: r.endAt ?? null,
        max_occurrences: r.maxOccurrences ?? null,
        next_occurrence_at: r.nextOccurrenceAt ?? null,
        last_occurrence_at: r.lastOccurrenceAt ?? null,
        is_active: r.isActive,
        created_at: r.createdAt,
      })),
      { onConflict: 'id' }
    );
    if (error) throw new Error(`Não foi possível salvar as recorrências: ${error.message}`);
    this.notifier.notify();
  }

  async deletePhase(id: string): Promise<void> {
    const { error } = await this.supabase.from('plan_phases').delete().eq('id', id);
    if (error) throw new Error(`Não foi possível remover a fase: ${error.message}`);
    this.notifier.notify();
  }

  async deleteAction(id: string): Promise<void> {
    const { error } = await this.supabase.from('plan_actions').delete().eq('id', id);
    if (error) throw new Error(`Não foi possível remover a ação: ${error.message}`);
    this.notifier.notify();
  }

  async findPlanById(id: string): Promise<ExecutionPlan | null> {
    const { data, error } = await this.supabase
      .from('execution_plans')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível carregar o plano: ${error.message}`);
    return data ? planRowToDomain(data) : null;
  }

  async findAllPlans(): Promise<ExecutionPlan[]> {
    const { data, error } = await this.supabase
      .from('execution_plans')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Não foi possível carregar os planos: ${error.message}`);
    return (data ?? []).map(planRowToDomain);
  }

  async findPlansByProject(projectId: string): Promise<ExecutionPlan[]> {
    const { data, error } = await this.supabase
      .from('execution_plans')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Não foi possível carregar os planos do projeto: ${error.message}`);
    return (data ?? []).map(planRowToDomain);
  }

  async findDetail(planId: string): Promise<PlanDetail | null> {
    const plan = await this.findPlanById(planId);
    if (!plan) return null;

    const [phasesRes, actionsRes, rulesRes] = await Promise.all([
      this.supabase
        .from('plan_phases')
        .select('*')
        .eq('execution_plan_id', planId)
        .order('position'),
      this.supabase
        .from('plan_actions')
        .select('*')
        .eq('execution_plan_id', planId)
        .order('position'),
      this.supabase
        .from('recurrence_rules')
        .select('*')
        .eq('execution_plan_id', planId)
        .order('created_at'),
    ]);

    if (phasesRes.error) throw new Error(`Falha ao carregar fases: ${phasesRes.error.message}`);
    if (actionsRes.error) throw new Error(`Falha ao carregar ações: ${actionsRes.error.message}`);
    if (rulesRes.error) throw new Error(`Falha ao carregar recorrências: ${rulesRes.error.message}`);

    return {
      plan,
      phases: (phasesRes.data ?? []).map(phaseRowToDomain),
      actions: (actionsRes.data ?? []).map(actionRowToDomain),
      recurrenceRules: (rulesRes.data ?? []).map(ruleRowToDomain),
    };
  }

  async findLatestProposal(planId: string) {
    const { data, error } = await this.supabase
      .from('ai_runs')
      .select('response_metadata')
      .eq('execution_plan_id', planId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível carregar a proposta da IA: ${error.message}`);
    const parsed = PlanProposalSchema.safeParse(data?.response_metadata);
    return parsed.success ? parsed.data : null;
  }

  subscribe(listener: () => void): () => void {
    return this.notifier.subscribe(listener);
  }
}

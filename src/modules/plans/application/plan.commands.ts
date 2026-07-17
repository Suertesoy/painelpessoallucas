import { EventRepository } from '@/platform/events/event.repository';
import {
  SourceDocumentRepository,
  ExecutionPlanRepository,
} from './plan.repository';
import {
  CreateSourceDocumentDTO,
  CreateSourceDocumentSchema,
  SourceDocument,
  SourceDocumentSchema,
  ExecutionPlan,
  ExecutionPlanSchema,
  PlanPhase,
  PlanAction,
  RecurrenceRule,
  PlanStatus,
} from '../domain/plan.schema';

/** Hash SHA-256 do conteúdo (para deduplicação e auditoria). */
export async function hashContent(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const APPROVABLE: PlanStatus[] = ['draft', 'awaiting_review'];

export class PlanCommands {
  constructor(
    private docRepo: SourceDocumentRepository,
    private planRepo: ExecutionPlanRepository,
    private eventRepo: EventRepository,
    /** Materializa ocorrências das regras do plano na ativação (Etapa 5). */
    private materializePlanRules?: (planId: string) => Promise<unknown>
  ) {}

  async createSourceDocument(
    dto: CreateSourceDocumentDTO,
    workspaceId: string
  ): Promise<SourceDocument> {
    const parsed = CreateSourceDocumentSchema.parse(dto);
    const now = new Date().toISOString();
    const doc: SourceDocument = {
      id: crypto.randomUUID(),
      workspaceId,
      projectId: parsed.projectId,
      title: parsed.title,
      documentType: parsed.documentType,
      originalContent: parsed.originalContent,
      contentHash: await hashContent(parsed.originalContent),
      source: parsed.source,
      processingStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    SourceDocumentSchema.parse(doc);
    await this.docRepo.save(doc);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'source_document.created',
      entityId: doc.id,
      workspaceId,
      source: 'manual',
      payload: { title: doc.title, documentType: doc.documentType, contentHash: doc.contentHash },
      createdAt: now,
    });

    return doc;
  }

  /** Atualizações pontuais do plano na revisão (nome, datas, objetivo). */
  async updatePlan(plan: ExecutionPlan): Promise<ExecutionPlan> {
    const updated = { ...plan, updatedAt: new Date().toISOString() };
    ExecutionPlanSchema.parse(updated);
    await this.planRepo.savePlan(updated);
    return updated;
  }

  async savePhases(phases: PlanPhase[]): Promise<void> {
    await this.planRepo.savePhases(phases);
  }

  async saveActions(actions: PlanAction[]): Promise<void> {
    await this.planRepo.saveActions(actions);
  }

  async saveRecurrenceRules(rules: RecurrenceRule[]): Promise<void> {
    await this.planRepo.saveRecurrenceRules(rules);
  }

  async deletePhase(id: string): Promise<void> {
    await this.planRepo.deletePhase(id);
  }

  async deleteAction(id: string): Promise<void> {
    await this.planRepo.deleteAction(id);
  }

  /**
   * Aprovação explícita: única transição que torna o plano definitivo.
   * A OpenAI nunca chama isto — somente o usuário, na tela de revisão.
   */
  async approvePlan(planId: string): Promise<ExecutionPlan> {
    const plan = await this.planRepo.findPlanById(planId);
    if (!plan) throw new Error('Plano não encontrado');
    if (!APPROVABLE.includes(plan.status)) {
      throw new Error(`Plano em status "${plan.status}" não pode ser aprovado`);
    }

    const now = new Date().toISOString();
    const approved: ExecutionPlan = {
      ...plan,
      status: 'approved',
      approvedAt: now,
      updatedAt: now,
    };
    ExecutionPlanSchema.parse(approved);
    await this.planRepo.savePlan(approved);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'execution_plan.approved',
      entityId: planId,
      workspaceId: plan.workspaceId,
      source: 'manual',
      payload: { name: plan.name },
      createdAt: now,
    });

    return approved;
  }

  /** Ativa um plano aprovado (a materialização de ocorrências é da Etapa 5). */
  async activatePlan(planId: string): Promise<ExecutionPlan> {
    const plan = await this.planRepo.findPlanById(planId);
    if (!plan) throw new Error('Plano não encontrado');
    if (plan.status !== 'approved') {
      throw new Error('Somente planos aprovados podem ser ativados');
    }

    const now = new Date().toISOString();
    const active: ExecutionPlan = { ...plan, status: 'active', updatedAt: now };
    ExecutionPlanSchema.parse(active);
    await this.planRepo.savePlan(active);

    // Gera as próximas ocorrências das rotinas aprovadas (idempotente).
    if (this.materializePlanRules) {
      await this.materializePlanRules(planId);
    }

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'execution_plan.activated',
      entityId: planId,
      workspaceId: plan.workspaceId,
      source: 'manual',
      payload: { name: plan.name },
      createdAt: now,
    });

    return active;
  }

  async setPlanStatus(planId: string, status: PlanStatus): Promise<ExecutionPlan> {
    const plan = await this.planRepo.findPlanById(planId);
    if (!plan) throw new Error('Plano não encontrado');

    const now = new Date().toISOString();
    const updated: ExecutionPlan = { ...plan, status, updatedAt: now };
    ExecutionPlanSchema.parse(updated);
    await this.planRepo.savePlan(updated);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'execution_plan.status_changed',
      entityId: planId,
      workspaceId: plan.workspaceId,
      source: 'manual',
      payload: { from: plan.status, to: status },
      createdAt: now,
    });

    return updated;
  }
}

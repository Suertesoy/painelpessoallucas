import type {
  SourceDocument,
  ExecutionPlan,
  PlanPhase,
  PlanAction,
  RecurrenceRule,
  PlanDetail,
} from '../domain/plan.schema';
import type { PlanProposal } from '../domain/plan-proposal.schema';

export interface SourceDocumentRepository {
  save(doc: SourceDocument): Promise<void>;
  findById(id: string): Promise<SourceDocument | null>;
  findAll(): Promise<SourceDocument[]>;
  subscribe(listener: () => void): () => void;
}

export interface ExecutionPlanRepository {
  savePlan(plan: ExecutionPlan): Promise<void>;
  savePhases(phases: PlanPhase[]): Promise<void>;
  saveActions(actions: PlanAction[]): Promise<void>;
  saveRecurrenceRules(rules: RecurrenceRule[]): Promise<void>;
  deletePhase(id: string): Promise<void>;
  deleteAction(id: string): Promise<void>;
  findPlanById(id: string): Promise<ExecutionPlan | null>;
  findAllPlans(): Promise<ExecutionPlan[]>;
  findPlansByProject(projectId: string): Promise<ExecutionPlan[]>;
  findDetail(planId: string): Promise<PlanDetail | null>;
  /** Proposta validada da última execução de IA concluída para o plano. */
  findLatestProposal(planId: string): Promise<PlanProposal | null>;
  subscribe(listener: () => void): () => void;
}

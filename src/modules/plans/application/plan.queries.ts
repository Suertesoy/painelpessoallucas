import {
  SourceDocumentRepository,
  ExecutionPlanRepository,
} from './plan.repository';
import type {
  SourceDocument,
  ExecutionPlan,
  PlanDetail,
} from '../domain/plan.schema';

export class PlanQueries {
  constructor(
    private docRepo: SourceDocumentRepository,
    private planRepo: ExecutionPlanRepository
  ) {}

  listDocuments(): Promise<SourceDocument[]> {
    return this.docRepo.findAll();
  }

  getDocumentById(id: string): Promise<SourceDocument | null> {
    return this.docRepo.findById(id);
  }

  listPlans(): Promise<ExecutionPlan[]> {
    return this.planRepo.findAllPlans();
  }

  listPlansByProject(projectId: string): Promise<ExecutionPlan[]> {
    return this.planRepo.findPlansByProject(projectId);
  }

  getPlanDetail(planId: string): Promise<PlanDetail | null> {
    return this.planRepo.findDetail(planId);
  }

  getPlanProposal(planId: string) {
    return this.planRepo.findLatestProposal(planId);
  }
}

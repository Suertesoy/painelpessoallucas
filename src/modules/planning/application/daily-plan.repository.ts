export interface DailyPlanRepository {
  save(plan: import('../domain/daily-plan.schema').DailyPlan): Promise<void>;
  findByDate(date: string): Promise<import('../domain/daily-plan.schema').DailyPlan | null>;
  subscribe(listener: () => void): () => void;
}

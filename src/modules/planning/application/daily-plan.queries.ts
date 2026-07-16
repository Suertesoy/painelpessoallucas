import { DailyPlanRepository } from './daily-plan.repository';
import { DailyPlan } from '../domain/daily-plan.schema';

export class DailyPlanQueries {
  constructor(private dailyPlanRepo: DailyPlanRepository) {}

  async getDailyPlan(date: string): Promise<DailyPlan | null> {
    return this.dailyPlanRepo.findByDate(date);
  }
}

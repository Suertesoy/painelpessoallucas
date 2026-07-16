import { DailyPlanRepository } from '../application/daily-plan.repository';
import { DailyPlan } from '../domain/daily-plan.schema';
import { LocalStorageAdapter } from '@/platform/storage/local-storage-adapter';

export class LocalStorageDailyPlanRepository extends LocalStorageAdapter<DailyPlan> implements DailyPlanRepository {
  constructor() {
    super('painelpessoal_dailyplan');
  }

  public save(plan: DailyPlan): Promise<void> {
    const plans = this.getItems();
    const index = plans.findIndex(p => p.date === plan.date && p.workspaceId === plan.workspaceId);
    if (index >= 0) {
      plans[index] = plan;
    } else {
      plans.push(plan);
    }
    this.saveItems(plans);
    return Promise.resolve();
  }

  public findByDate(date: string): Promise<DailyPlan | null> {
    const plans = this.getItems();
    const plan = plans.find(p => p.date === date);
    return Promise.resolve(plan || null);
  }
}

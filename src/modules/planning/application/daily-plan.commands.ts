import { DailyPlanRepository } from './daily-plan.repository';
import { EventRepository } from '@/platform/events/event.repository';
import { DailyPlan, DailyPlanSchema } from '../domain/daily-plan.schema';

export class DailyPlanCommands {
  constructor(
    private dailyPlanRepo: DailyPlanRepository,
    private eventRepo: EventRepository
  ) {}

  async setDailyFocus(workspaceId: string, date: string, itemIds: string[]): Promise<DailyPlan> {
    if (itemIds.length > 3) {
      throw new Error("No máximo 3 itens permitidos no foco diário");
    }

    let plan = await this.dailyPlanRepo.findByDate(date);
    
    if (!plan) {
      plan = {
        workspaceId,
        date,
        focusItemIds: itemIds,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } else {
      plan = {
        ...plan,
        focusItemIds: itemIds,
        updatedAt: new Date().toISOString()
      };
    }

    DailyPlanSchema.parse(plan);
    await this.dailyPlanRepo.save(plan);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'daily_plan.focus_updated',
      entityId: date,
      workspaceId,
      source: 'manual',
      payload: plan,
      createdAt: new Date().toISOString(),
    });

    return plan;
  }

  async removeDailyFocusItem(workspaceId: string, date: string, itemId: string): Promise<DailyPlan> {
    const plan = await this.dailyPlanRepo.findByDate(date);
    if (!plan) throw new Error("Plano diário não encontrado");

    const newFocus = plan.focusItemIds.filter(id => id !== itemId);
    return this.setDailyFocus(workspaceId, date, newFocus);
  }
}

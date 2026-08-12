import { DailyPlanRepository } from './daily-plan.repository';
import { DailyPlan } from '../domain/daily-plan.schema';

/**
 * @deprecated "Foco do Dia" saiu da Home (Fase 1 — blocos de rotina). Não
 * chamar a partir de código novo. Ver DailyPlanSchema para o motivo de não
 * remover ainda.
 */
export class DailyPlanQueries {
  constructor(private dailyPlanRepo: DailyPlanRepository) {}

  async getDailyPlan(date: string): Promise<DailyPlan | null> {
    return this.dailyPlanRepo.findByDate(date);
  }
}

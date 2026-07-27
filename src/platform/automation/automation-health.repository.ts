import type { AutomationHealth } from './automation-health';

/** Leitura, somente consulta, do estado de saúde das automações do workspace. */
export interface AutomationHealthRepository {
  getHealth(): Promise<AutomationHealth>;
}

import type { EventRepository } from '@/platform/events/event.repository';
import type { FinanceRepository, UpsertMonthlyRecordInput } from './finance.repository';
import type { FinanceMonthlyRecord } from '../domain/finance-monthly-record.schema';

/**
 * Renda de Matheus/Lucas, outras entradas, dinheiro disponível e guardado —
 * sempre registrados manualmente por mês (seção 3 do pedido). Nenhum valor é
 * copiado automaticamente de um mês para o outro (a cópia do padrão do
 * Matheus acontece só na CRIAÇÃO do registro do mês, no repositório).
 */
export class FinanceMonthlyCommands {
  constructor(
    private repo: FinanceRepository,
    private eventRepo: EventRepository,
    private workspaceId: string
  ) {}

  async upsertMonthlyRecord(input: UpsertMonthlyRecordInput): Promise<FinanceMonthlyRecord> {
    const record = await this.repo.upsertMonthlyRecord(input);
    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'finance.monthly_values_updated',
      entityId: record.id,
      workspaceId: this.workspaceId,
      source: 'manual',
      payload: { month: record.month },
      createdAt: new Date().toISOString(),
    });
    return record;
  }
}

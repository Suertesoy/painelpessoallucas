import type { EventRepository } from '@/platform/events/event.repository';
import type { FinanceRepository, EnsureFinanceDefaultsResult } from './finance.repository';
import type { FinanceSettings } from '../domain/finance-settings.schema';
import type { FinanceSource, FinanceSourceKind } from '../domain/finance-source.schema';

/**
 * Comandos de configuração inicial do módulo: categorias/origens/settings
 * idempotentes por workspace (mesmo motivo de `ShoppingCommands.
 * ensureDefaultLists`/`LearningCommands.initializeDefaultLearningContent` —
 * tabela por workspace, não alcançável por seed de migration), e a
 * atualização do valor padrão de renda do Matheus (nunca retroativa).
 */
export class FinanceSetupCommands {
  constructor(
    private repo: FinanceRepository,
    private eventRepo: EventRepository,
    private workspaceId: string
  ) {}

  async ensureDefaults(): Promise<EnsureFinanceDefaultsResult> {
    const result = await this.repo.ensureDefaults();
    if (result.createdSettings || result.createdCategoriesCount > 0 || result.createdSourcesCount > 0) {
      await this.eventRepo.save({
        id: crypto.randomUUID(),
        type: 'finance.setup_initialized',
        entityId: this.workspaceId,
        workspaceId: this.workspaceId,
        source: 'manual',
        payload: {
          categoriesCreated: result.createdCategoriesCount,
          sourcesCreated: result.createdSourcesCount,
          settingsCreated: result.createdSettings,
        },
        createdAt: new Date().toISOString(),
      });
    }
    return result;
  }

  /**
   * Atualiza o valor padrão de renda do Matheus para MESES FUTUROS. Nunca
   * reescreve `finance_monthly_records` já existentes — cada mês guarda seu
   * próprio valor no momento em que foi criado.
   */
  async updateDefaultMatheusIncome(defaultMatheusIncomeCents: number): Promise<FinanceSettings> {
    return this.repo.updateDefaultMatheusIncome(defaultMatheusIncomeCents);
  }

  async createSource(input: { name: string; kind: FinanceSourceKind }): Promise<FinanceSource> {
    return this.repo.createSource(input);
  }
}

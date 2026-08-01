import type { EventRepository } from '@/platform/events/event.repository';
import type {
  FinanceRepository,
  UpdateImportRowInput,
  CreateClassificationRuleInput,
  ConfirmImportResult,
} from './finance.repository';
import type { FinanceImportRow } from '../domain/finance-import.schema';
import type { FinanceClassificationRule } from '../domain/finance-classification-rule.schema';

/**
 * Comandos do ciclo de vida de uma importação já criada (a criação em si —
 * upload, parse, hash, classificação inicial — acontece na rota de servidor
 * `/api/finance/import`, que nunca persiste o arquivo bruto). Estes comandos
 * cobrem a revisão: editar uma linha, ignorá-la, confirmar o lote inteiro e
 * criar uma regra de classificação (só após confirmação explícita do
 * usuário — nunca automático).
 */
export class FinanceImportCommands {
  constructor(
    private repo: FinanceRepository,
    private eventRepo: EventRepository,
    private workspaceId: string
  ) {}

  async updateReviewRow(rowId: string, patch: UpdateImportRowInput): Promise<FinanceImportRow> {
    const updated = await this.repo.updateImportRow(rowId, patch);
    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'finance.transaction_updated',
      entityId: rowId,
      workspaceId: this.workspaceId,
      source: 'manual',
      // Só os campos alterados (nomes), nunca o valor/descrição em si.
      payload: { fieldsChanged: Object.keys(patch) },
      createdAt: new Date().toISOString(),
    });
    return updated;
  }

  async ignoreRow(rowId: string): Promise<FinanceImportRow> {
    return this.repo.updateImportRow(rowId, { status: 'ignored', nature: 'ignored' });
  }

  async confirmImport(importId: string): Promise<ConfirmImportResult> {
    const result = await this.repo.confirmImport(importId);
    if (!result.alreadyConfirmed) {
      await this.eventRepo.save({
        id: crypto.randomUUID(),
        type: 'finance.import_confirmed',
        entityId: importId,
        workspaceId: this.workspaceId,
        source: 'manual',
        payload: { importId, transactionCount: result.createdTransactionCount },
        createdAt: new Date().toISOString(),
      });
    }
    return result;
  }

  /** Cria a regra só depois da confirmação explícita ("Aplicar a lançamentos semelhantes"). */
  async createClassificationRuleFromReview(input: CreateClassificationRuleInput): Promise<FinanceClassificationRule> {
    const rule = await this.repo.createClassificationRule(input);
    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'finance.classification_rule_created',
      entityId: rule.id,
      workspaceId: this.workspaceId,
      source: 'manual',
      payload: { matchType: rule.matchType, categoryId: rule.categoryId },
      createdAt: new Date().toISOString(),
    });
    return rule;
  }
}

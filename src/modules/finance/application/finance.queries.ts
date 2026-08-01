import type { FinanceRepository, TransactionFilter } from './finance.repository';
import type { FinanceSettings } from '../domain/finance-settings.schema';
import type { FinanceCategory } from '../domain/finance-category.schema';
import type { FinanceSource } from '../domain/finance-source.schema';
import type { FinanceClassificationRule } from '../domain/finance-classification-rule.schema';
import type { FinanceImport, FinanceImportRow } from '../domain/finance-import.schema';
import type { FinanceTransaction } from '../domain/finance-transaction.schema';
import type { FinanceMonthlyRecord } from '../domain/finance-monthly-record.schema';

export interface ImportReview {
  import: FinanceImport;
  rows: FinanceImportRow[];
}

/** Leituras de configuração, importações/revisão e transações confirmadas. */
export class FinanceQueries {
  constructor(private repo: FinanceRepository) {}

  async getSettings(): Promise<FinanceSettings | null> {
    return this.repo.getSettings();
  }

  async listCategories(): Promise<FinanceCategory[]> {
    return this.repo.listCategories();
  }

  async listSources(): Promise<FinanceSource[]> {
    return this.repo.listSources();
  }

  async listClassificationRules(): Promise<FinanceClassificationRule[]> {
    return this.repo.listClassificationRules();
  }

  async listImports(): Promise<FinanceImport[]> {
    return this.repo.listImports();
  }

  async getImportReview(importId: string): Promise<ImportReview | null> {
    const importRecord = await this.repo.getImportById(importId);
    if (!importRecord) return null;
    const rows = await this.repo.listImportRows(importId);
    return { import: importRecord, rows };
  }

  async listTransactions(filter?: TransactionFilter): Promise<FinanceTransaction[]> {
    return this.repo.listTransactions(filter);
  }

  async listMonthlyRecords(): Promise<FinanceMonthlyRecord[]> {
    return this.repo.listMonthlyRecords();
  }

  async getMonthlyRecord(month: string): Promise<FinanceMonthlyRecord | null> {
    return this.repo.getMonthlyRecord(month);
  }
}

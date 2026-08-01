import type { FinanceSettings } from '../domain/finance-settings.schema';
import type { FinanceSource, FinanceSourceKind } from '../domain/finance-source.schema';
import type { FinanceCategory } from '../domain/finance-category.schema';
import type { FinanceImport, FinanceImportRow, FinanceImportRowStatus } from '../domain/finance-import.schema';
import type { FinanceTransaction, FinanceNature } from '../domain/finance-transaction.schema';
import type {
  FinanceClassificationRule,
  FinanceClassificationMatchType,
} from '../domain/finance-classification-rule.schema';
import type { FinanceMonthlyRecord } from '../domain/finance-monthly-record.schema';

/**
 * Interface única agregando todas as sub-entidades do módulo Finanças —
 * mesmo princípio de `ExecutionPlanRepository` (que reúne plano/fases/
 * ações/recorrências em `modules/plans`): um repositório por módulo, várias
 * responsabilidades internas claramente nomeadas, uma única inscrição no
 * `ChangeNotifier` compartilhado.
 */

export interface EnsureFinanceDefaultsResult {
  settings: FinanceSettings;
  categories: FinanceCategory[];
  sources: FinanceSource[];
  createdCategoriesCount: number;
  createdSourcesCount: number;
  createdSettings: boolean;
}

export interface UpdateImportRowInput {
  categoryId?: string;
  nature?: FinanceNature;
  description?: string;
  transactionDate?: string;
  amountCents?: number;
  status?: FinanceImportRowStatus;
}

export interface CreateClassificationRuleInput {
  matchType: FinanceClassificationMatchType;
  matchText: string;
  categoryId: string;
  nature?: FinanceNature | null;
}

export interface UpsertMonthlyRecordInput {
  month: string;
  matheusIncomeCents?: number;
  lucasIncomeCents?: number;
  otherIncomeCents?: number;
  availableCashCents?: number;
  savedCashCents?: number;
}

export interface TransactionFilter {
  month?: string; // YYYY-MM-01 (usa o mês inteiro)
  categoryId?: string;
  nature?: FinanceNature;
  sourceId?: string;
  search?: string;
}

export interface ConfirmImportResult {
  import: FinanceImport;
  createdTransactionCount: number;
  alreadyConfirmed: boolean;
}

export interface FinanceRepository {
  // Configuração / setup idempotente
  ensureDefaults(): Promise<EnsureFinanceDefaultsResult>;
  getSettings(): Promise<FinanceSettings | null>;
  updateDefaultMatheusIncome(defaultMatheusIncomeCents: number): Promise<FinanceSettings>;
  listCategories(): Promise<FinanceCategory[]>;
  listSources(): Promise<FinanceSource[]>;
  createSource(input: { name: string; kind: FinanceSourceKind }): Promise<FinanceSource>;

  // Regras de classificação
  listClassificationRules(): Promise<FinanceClassificationRule[]>;
  createClassificationRule(input: CreateClassificationRuleInput): Promise<FinanceClassificationRule>;

  // Importações e revisão
  listImports(): Promise<FinanceImport[]>;
  getImportById(importId: string): Promise<FinanceImport | null>;
  listImportRows(importId: string): Promise<FinanceImportRow[]>;
  updateImportRow(rowId: string, patch: UpdateImportRowInput): Promise<FinanceImportRow>;
  confirmImport(importId: string): Promise<ConfirmImportResult>;

  // Transações confirmadas
  listTransactions(filter?: TransactionFilter): Promise<FinanceTransaction[]>;

  // Registros mensais (renda/disponível/guardado)
  listMonthlyRecords(): Promise<FinanceMonthlyRecord[]>;
  getMonthlyRecord(month: string): Promise<FinanceMonthlyRecord | null>;
  upsertMonthlyRecord(input: UpsertMonthlyRecordInput): Promise<FinanceMonthlyRecord>;

  subscribe(listener: () => void): () => void;
}

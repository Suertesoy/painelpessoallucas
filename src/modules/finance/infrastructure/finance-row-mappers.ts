import { FinanceSettingsSchema, type FinanceSettings } from '../domain/finance-settings.schema';
import { FinanceSourceSchema, type FinanceSource } from '../domain/finance-source.schema';
import { FinanceCategorySchema, type FinanceCategory } from '../domain/finance-category.schema';
import {
  FinanceClassificationRuleSchema,
  type FinanceClassificationRule,
} from '../domain/finance-classification-rule.schema';
import { FinanceImportSchema, FinanceImportRowSchema, type FinanceImport, type FinanceImportRow } from '../domain/finance-import.schema';
import { FinanceTransactionSchema, type FinanceTransaction } from '../domain/finance-transaction.schema';
import { FinanceMonthlyRecordSchema, type FinanceMonthlyRecord } from '../domain/finance-monthly-record.schema';

/** Mapeadores puros snake_case (linha do Postgres) -> camelCase (domínio), validados por Zod. */

export interface FinanceSettingsRow {
  id: string;
  workspace_id: string;
  default_matheus_income_cents: number;
  created_at: string;
  updated_at: string;
}

export function rowToFinanceSettings(row: FinanceSettingsRow): FinanceSettings {
  return FinanceSettingsSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    defaultMatheusIncomeCents: row.default_matheus_income_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export interface FinanceSourceRow {
  id: string;
  workspace_id: string;
  name: string;
  kind: string;
  provider: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export function rowToFinanceSource(row: FinanceSourceRow): FinanceSource {
  return FinanceSourceSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    kind: row.kind,
    provider: row.provider,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export interface FinanceCategoryRow {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export function rowToFinanceCategory(row: FinanceCategoryRow): FinanceCategory {
  return FinanceCategorySchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    slug: row.slug,
    name: row.name,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export interface FinanceClassificationRuleRow {
  id: string;
  workspace_id: string;
  match_type: string;
  match_text: string;
  category_id: string;
  nature: string | null;
  created_at: string;
}

export function rowToFinanceClassificationRule(row: FinanceClassificationRuleRow): FinanceClassificationRule {
  return FinanceClassificationRuleSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    matchType: row.match_type,
    matchText: row.match_text,
    categoryId: row.category_id,
    nature: row.nature,
    createdAt: row.created_at,
  });
}

export interface FinanceImportRowDb {
  id: string;
  workspace_id: string;
  source_id: string;
  file_name: string;
  file_sha256: string;
  format: string;
  status: string;
  row_count: number;
  statement_start: string | null;
  statement_end: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToFinanceImport(row: FinanceImportRowDb): FinanceImport {
  return FinanceImportSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    sourceId: row.source_id,
    fileName: row.file_name,
    fileSha256: row.file_sha256,
    format: row.format,
    status: row.status,
    rowCount: row.row_count,
    statementStart: row.statement_start,
    statementEnd: row.statement_end,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export interface FinanceImportRowLineDb {
  id: string;
  workspace_id: string;
  import_id: string;
  row_index: number;
  transaction_date: string;
  description: string;
  original_description: string;
  amount_cents: number;
  source_amount_cents: number | null;
  fitid: string | null;
  fingerprint: string | null;
  category_id: string;
  nature: string;
  suggested_category_id: string | null;
  suggested_nature: string | null;
  classification_reason: string | null;
  possible_duplicate_transaction_id: string | null;
  possible_duplicate_import_row_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export function rowToFinanceImportRow(row: FinanceImportRowLineDb): FinanceImportRow {
  return FinanceImportRowSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    importId: row.import_id,
    rowIndex: row.row_index,
    transactionDate: row.transaction_date,
    description: row.description,
    originalDescription: row.original_description,
    amountCents: row.amount_cents,
    sourceAmountCents: row.source_amount_cents ?? null,
    fitid: row.fitid,
    fingerprint: row.fingerprint,
    categoryId: row.category_id,
    nature: row.nature,
    suggestedCategoryId: row.suggested_category_id,
    suggestedNature: row.suggested_nature,
    classificationReason: row.classification_reason,
    possibleDuplicateTransactionId: row.possible_duplicate_transaction_id,
    possibleDuplicateImportRowId: row.possible_duplicate_import_row_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export interface FinanceTransactionRowDb {
  id: string;
  workspace_id: string;
  source_id: string;
  import_id: string;
  import_row_id: string;
  transaction_date: string;
  description: string;
  original_description: string;
  amount_cents: number;
  source_amount_cents: number | null;
  category_id: string;
  nature: string;
  fitid: string | null;
  fingerprint: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToFinanceTransaction(row: FinanceTransactionRowDb): FinanceTransaction {
  return FinanceTransactionSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    sourceId: row.source_id,
    importId: row.import_id,
    importRowId: row.import_row_id,
    transactionDate: row.transaction_date,
    description: row.description,
    originalDescription: row.original_description,
    amountCents: row.amount_cents,
    sourceAmountCents: row.source_amount_cents ?? null,
    categoryId: row.category_id,
    nature: row.nature,
    fitid: row.fitid,
    fingerprint: row.fingerprint,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export interface FinanceMonthlyRecordRowDb {
  id: string;
  workspace_id: string;
  month: string;
  matheus_income_cents: number;
  lucas_income_cents: number;
  other_income_cents: number;
  available_cash_cents: number;
  lucas_available_cash_cents: number;
  matheus_available_cash_cents: number;
  saved_cash_cents: number;
  created_at: string;
  updated_at: string;
}

export function rowToFinanceMonthlyRecord(row: FinanceMonthlyRecordRowDb): FinanceMonthlyRecord {
  return FinanceMonthlyRecordSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    month: row.month,
    matheusIncomeCents: row.matheus_income_cents,
    lucasIncomeCents: row.lucas_income_cents,
    otherIncomeCents: row.other_income_cents,
    availableCashCents: row.available_cash_cents,
    lucasAvailableCashCents: row.lucas_available_cash_cents ?? 0,
    matheusAvailableCashCents: row.matheus_available_cash_cents ?? 0,
    savedCashCents: row.saved_cash_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

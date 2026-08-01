'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChangeNotifier } from '@/platform/supabase/change-notifier';
import type {
  FinanceRepository,
  EnsureFinanceDefaultsResult,
  UpdateImportRowInput,
  CreateClassificationRuleInput,
  UpsertMonthlyRecordInput,
  TransactionFilter,
  ConfirmImportResult,
} from '../application/finance.repository';
import { ensureFinanceDefaults } from './ensure-finance-defaults';
import {
  rowToFinanceSettings,
  rowToFinanceSource,
  rowToFinanceCategory,
  rowToFinanceClassificationRule,
  rowToFinanceImport,
  rowToFinanceImportRow,
  rowToFinanceTransaction,
  rowToFinanceMonthlyRecord,
} from './finance-row-mappers';
import type { FinanceSettings } from '../domain/finance-settings.schema';
import type { FinanceSource, FinanceSourceKind } from '../domain/finance-source.schema';
import type { FinanceCategory } from '../domain/finance-category.schema';
import type { FinanceImport, FinanceImportRow } from '../domain/finance-import.schema';
import type { FinanceTransaction } from '../domain/finance-transaction.schema';
import type { FinanceClassificationRule } from '../domain/finance-classification-rule.schema';
import type { FinanceMonthlyRecord } from '../domain/finance-monthly-record.schema';
import { shiftMonthKey } from '../domain/finance-monthly-record.schema';

/**
 * Implementação Supabase da interface agregada — mesmo padrão de
 * `SupabaseShoppingListRepository`: `'use client'`, mensagens de erro em
 * português nunca expondo o erro cru do Postgres, `notifier.notify()` só
 * quando algo realmente mudou.
 */
export class SupabaseFinanceRepository implements FinanceRepository {
  constructor(
    private supabase: SupabaseClient,
    private workspaceId: string,
    private notifier: ChangeNotifier
  ) {}

  async ensureDefaults(): Promise<EnsureFinanceDefaultsResult> {
    const result = await ensureFinanceDefaults(this.supabase, this.workspaceId);
    if (result.createdSettings || result.createdCategories.length > 0 || result.createdSources.length > 0) {
      this.notifier.notify();
    }
    return {
      settings: rowToFinanceSettings(result.settings),
      categories: result.categories.map(rowToFinanceCategory),
      sources: result.sources.map(rowToFinanceSource),
      createdCategoriesCount: result.createdCategories.length,
      createdSourcesCount: result.createdSources.length,
      createdSettings: result.createdSettings,
    };
  }

  async getSettings(): Promise<FinanceSettings | null> {
    const { data, error } = await this.supabase
      .from('finance_settings')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível carregar a configuração financeira: ${error.message}`);
    return data ? rowToFinanceSettings(data) : null;
  }

  async updateDefaultMatheusIncome(defaultMatheusIncomeCents: number): Promise<FinanceSettings> {
    const { data, error } = await this.supabase
      .from('finance_settings')
      .update({ default_matheus_income_cents: defaultMatheusIncomeCents })
      .eq('workspace_id', this.workspaceId)
      .select()
      .single();
    if (error) throw new Error(`Não foi possível atualizar o valor padrão de renda: ${error.message}`);
    this.notifier.notify();
    return rowToFinanceSettings(data);
  }

  async listCategories(): Promise<FinanceCategory[]> {
    const { data, error } = await this.supabase
      .from('finance_categories')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .order('position', { ascending: true });
    if (error) throw new Error(`Não foi possível carregar as categorias: ${error.message}`);
    return (data ?? []).map(rowToFinanceCategory);
  }

  async listSources(): Promise<FinanceSource[]> {
    const { data, error } = await this.supabase
      .from('finance_sources')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .order('name', { ascending: true });
    if (error) throw new Error(`Não foi possível carregar as origens: ${error.message}`);
    return (data ?? []).map(rowToFinanceSource);
  }

  async createSource(input: { name: string; kind: FinanceSourceKind }): Promise<FinanceSource> {
    const { data, error } = await this.supabase
      .from('finance_sources')
      .insert({ workspace_id: this.workspaceId, name: input.name, kind: input.kind })
      .select()
      .single();
    if (error) throw new Error(`Não foi possível criar a origem: ${error.message}`);
    this.notifier.notify();
    return rowToFinanceSource(data);
  }

  async listClassificationRules(): Promise<FinanceClassificationRule[]> {
    const { data, error } = await this.supabase
      .from('finance_classification_rules')
      .select('*')
      .eq('workspace_id', this.workspaceId);
    if (error) throw new Error(`Não foi possível carregar as regras de classificação: ${error.message}`);
    return (data ?? []).map(rowToFinanceClassificationRule);
  }

  async createClassificationRule(input: CreateClassificationRuleInput): Promise<FinanceClassificationRule> {
    const { data, error } = await this.supabase
      .from('finance_classification_rules')
      .insert({
        workspace_id: this.workspaceId,
        match_type: input.matchType,
        match_text: input.matchText,
        category_id: input.categoryId,
        nature: input.nature ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(`Não foi possível criar a regra de classificação: ${error.message}`);
    this.notifier.notify();
    return rowToFinanceClassificationRule(data);
  }

  async listImports(): Promise<FinanceImport[]> {
    const { data, error } = await this.supabase
      .from('finance_imports')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Não foi possível carregar as importações: ${error.message}`);
    return (data ?? []).map(rowToFinanceImport);
  }

  async getImportById(importId: string): Promise<FinanceImport | null> {
    const { data, error } = await this.supabase
      .from('finance_imports')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('id', importId)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível carregar a importação: ${error.message}`);
    return data ? rowToFinanceImport(data) : null;
  }

  async listImportRows(importId: string): Promise<FinanceImportRow[]> {
    const { data, error } = await this.supabase
      .from('finance_import_rows')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('import_id', importId)
      .order('row_index', { ascending: true });
    if (error) throw new Error(`Não foi possível carregar as linhas da importação: ${error.message}`);
    return (data ?? []).map(rowToFinanceImportRow);
  }

  async updateImportRow(rowId: string, patch: UpdateImportRowInput): Promise<FinanceImportRow> {
    const update: Record<string, unknown> = {};
    if (patch.categoryId !== undefined) update.category_id = patch.categoryId;
    if (patch.nature !== undefined) update.nature = patch.nature;
    if (patch.description !== undefined) update.description = patch.description;
    if (patch.transactionDate !== undefined) update.transaction_date = patch.transactionDate;
    if (patch.amountCents !== undefined) update.amount_cents = patch.amountCents;
    if (patch.status !== undefined) update.status = patch.status;

    const { data, error } = await this.supabase
      .from('finance_import_rows')
      .update(update)
      .eq('workspace_id', this.workspaceId)
      .eq('id', rowId)
      .select()
      .single();
    if (error) throw new Error(`Não foi possível atualizar a linha da importação: ${error.message}`);
    this.notifier.notify();
    return rowToFinanceImportRow(data);
  }

  async confirmImport(importId: string): Promise<ConfirmImportResult> {
    const { data, error } = await this.supabase.rpc('confirm_finance_import', { p_import_id: importId });
    if (error) throw new Error(`Não foi possível confirmar a importação: ${error.message}`);
    const result = (Array.isArray(data) ? data[0] : data) as
      | { transaction_count: number; already_confirmed: boolean }
      | undefined;

    const importRecord = await this.getImportById(importId);
    if (!importRecord) throw new Error('Importação não encontrada após a confirmação.');
    this.notifier.notify();
    return {
      import: importRecord,
      createdTransactionCount: result?.transaction_count ?? 0,
      alreadyConfirmed: result?.already_confirmed ?? false,
    };
  }

  async listTransactions(filter?: TransactionFilter): Promise<FinanceTransaction[]> {
    let query = this.supabase.from('finance_transactions').select('*').eq('workspace_id', this.workspaceId);
    if (filter?.month) {
      const nextMonth = shiftMonthKey(filter.month, 1);
      query = query.gte('transaction_date', filter.month).lt('transaction_date', nextMonth);
    }
    if (filter?.categoryId) query = query.eq('category_id', filter.categoryId);
    if (filter?.nature) query = query.eq('nature', filter.nature);
    if (filter?.sourceId) query = query.eq('source_id', filter.sourceId);
    if (filter?.search) query = query.ilike('description', `%${filter.search}%`);

    const { data, error } = await query.order('transaction_date', { ascending: false });
    if (error) throw new Error(`Não foi possível carregar as transações: ${error.message}`);
    return (data ?? []).map(rowToFinanceTransaction);
  }

  async listMonthlyRecords(): Promise<FinanceMonthlyRecord[]> {
    const { data, error } = await this.supabase
      .from('finance_monthly_records')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .order('month', { ascending: true });
    if (error) throw new Error(`Não foi possível carregar os registros mensais: ${error.message}`);
    return (data ?? []).map(rowToFinanceMonthlyRecord);
  }

  async getMonthlyRecord(month: string): Promise<FinanceMonthlyRecord | null> {
    const { data, error } = await this.supabase
      .from('finance_monthly_records')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('month', month)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível carregar o registro do mês: ${error.message}`);
    return data ? rowToFinanceMonthlyRecord(data) : null;
  }

  async upsertMonthlyRecord(input: UpsertMonthlyRecordInput): Promise<FinanceMonthlyRecord> {
    const existing = await this.getMonthlyRecord(input.month);
    if (existing) {
      const update: Record<string, unknown> = {};
      if (input.matheusIncomeCents !== undefined) update.matheus_income_cents = input.matheusIncomeCents;
      if (input.lucasIncomeCents !== undefined) update.lucas_income_cents = input.lucasIncomeCents;
      if (input.otherIncomeCents !== undefined) update.other_income_cents = input.otherIncomeCents;
      if (input.availableCashCents !== undefined) update.available_cash_cents = input.availableCashCents;
      if (input.savedCashCents !== undefined) update.saved_cash_cents = input.savedCashCents;

      const { data, error } = await this.supabase
        .from('finance_monthly_records')
        .update(update)
        .eq('workspace_id', this.workspaceId)
        .eq('month', input.month)
        .select()
        .single();
      if (error) throw new Error(`Não foi possível atualizar o registro do mês: ${error.message}`);
      this.notifier.notify();
      return rowToFinanceMonthlyRecord(data);
    }

    // Mês novo: renda do Matheus pré-preenchida com o valor padrão ATUAL
    // (fotografia no momento da criação — mudar o padrão depois nunca altera
    // este registro). Renda do Lucas NUNCA copiada do mês anterior.
    const settings = await this.getSettings();
    const insertPayload = {
      workspace_id: this.workspaceId,
      month: input.month,
      matheus_income_cents: input.matheusIncomeCents ?? settings?.defaultMatheusIncomeCents ?? 0,
      lucas_income_cents: input.lucasIncomeCents ?? 0,
      other_income_cents: input.otherIncomeCents ?? 0,
      available_cash_cents: input.availableCashCents ?? 0,
      saved_cash_cents: input.savedCashCents ?? 0,
    };
    const { data, error } = await this.supabase
      .from('finance_monthly_records')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw new Error(`Não foi possível criar o registro do mês: ${error.message}`);
    this.notifier.notify();
    return rowToFinanceMonthlyRecord(data);
  }

  subscribe(listener: () => void): () => void {
    return this.notifier.subscribe(listener);
  }
}

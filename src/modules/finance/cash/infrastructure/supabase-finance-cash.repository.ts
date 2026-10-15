'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChangeNotifier } from '@/platform/supabase/change-notifier';
import type { CardId, MonthKey } from '../domain/month';
import type {
  Balance, BalanceTransfer, CardInvoice, Commitment, InvoiceImportRecord, InvoiceItem, Occurrence, Receivable,
} from '../domain/types';
import type { CommitmentInputT, InvoiceManualInputT, ReceivableInputT } from '../domain/cash.schema';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const num = (v: unknown): number => Number(v);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

const toBalance = (r: Row | null): Balance => ({
  availableCents: r ? num(r.available_cents) : 0,
  reserveCents: r ? num(r.reserve_cents) : 0,
  availableUpdatedAt: r?.available_updated_at ?? null,
  reserveUpdatedAt: r?.reserve_updated_at ?? null,
});
const toTransfer = (r: Row): BalanceTransfer => ({
  id: r.id, direction: r.direction, amountCents: num(r.amount_cents), note: r.note ?? null, createdAt: r.created_at,
});
const toReceivable = (r: Row): Receivable => ({
  id: r.id, description: r.description, amountCents: num(r.amount_cents), expectedDate: r.expected_date,
  status: r.status, notes: r.notes ?? null, receivedAt: r.received_at ?? null,
});
const toCommitment = (r: Row): Commitment => ({
  id: r.id, description: r.description, amountCents: num(r.amount_cents), recurrence: r.recurrence,
  dueDate: r.due_date ?? null, dayOfMonth: r.day_of_month ?? null, startMonth: r.start_month, endMonth: r.end_month ?? null,
  billing: r.billing, card: r.card ?? null, category: r.category ?? null, active: r.active,
});
const toOccurrence = (r: Row): Occurrence => ({
  id: r.id, commitmentId: r.commitment_id, month: r.month, amountCents: numOrNull(r.amount_cents), status: r.status,
});
const toInvoice = (r: Row): CardInvoice => ({
  id: r.id, card: r.card, month: r.month, status: r.status, manualAmountCents: numOrNull(r.manual_amount_cents),
  importedAmountCents: numOrNull(r.imported_amount_cents), dueDate: r.due_date ?? null, paidAt: r.paid_at ?? null,
  lastImportedAt: r.last_imported_at ?? null, rev: r.rev,
});
const toItem = (r: Row): InvoiceItem => ({
  id: r.id, invoiceId: r.invoice_id, date: r.purchase_date, description: r.description,
  normalizedDescription: r.normalized_description, amountCents: num(r.amount_cents), kind: r.kind,
  occurrenceIndex: r.occurrence_index, installmentNo: r.installment_no ?? null, installmentTotal: r.installment_total ?? null,
  baseDescription: r.base_description, status: r.status, commitmentId: r.commitment_id ?? null, reviewNote: r.review_note ?? null,
});
const toImport = (r: Row): InvoiceImportRecord => ({
  id: r.id, invoiceId: r.invoice_id, fileName: r.file_name, rowCount: r.row_count, recognizedCount: r.recognized_count,
  newCount: r.new_count, changedCount: r.changed_count, missingCount: r.missing_count, createdAt: r.created_at,
});

/**
 * Persistência do caixa da casa. Toda mutação que mexe em saldo passa por
 * função SQL transacional; o resto usa RLS direta. Mensagens de erro em
 * português, nunca o erro cru do Postgres para a interface.
 */
export class SupabaseFinanceCashRepository {
  constructor(
    private supabase: SupabaseClient,
    private workspaceId: string,
    private notifier: ChangeNotifier
  ) {}

  subscribe(listener: () => void): () => void {
    return this.notifier.subscribe(listener);
  }

  private fail(context: string, error: { message: string; code?: string }): never {
    if (error.message.includes('RESERVE_INSUFFICIENT')) throw new Error('A reserva não tem saldo suficiente para essa transferência.');
    if (error.message.includes('INVOICE_PAID')) throw new Error('Esta fatura já está paga. Reabra-a para revisar os lançamentos.');
    if (error.message.includes('STALE_INVOICE')) throw new Error('A fatura mudou desde a pré-visualização. Envie o arquivo de novo para revisar.');
    if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202') {
      throw new Error('schema cache: atualização do banco pendente');
    }
    console.error(`[finance-cash] ${context}`, error.code ?? '');
    throw new Error(`${context}. Tente novamente.`);
  }

  // ---------------------------------------------------------------- saldo
  async getBalance(): Promise<Balance> {
    const { data, error } = await this.supabase.from('finance_balance').select('*').eq('workspace_id', this.workspaceId).maybeSingle();
    if (error) this.fail('Não foi possível carregar o saldo', error);
    return toBalance(data);
  }

  async setBalance(availableCents: number | null, reserveCents: number | null): Promise<Balance> {
    const { data, error } = await this.supabase.rpc('finance_set_balance', {
      p_workspace_id: this.workspaceId, p_available_cents: availableCents, p_reserve_cents: reserveCents,
    });
    if (error) this.fail('Não foi possível atualizar o saldo', error);
    this.notifier.notify();
    return toBalance(data);
  }

  async transfer(direction: BalanceTransfer['direction'], amountCents: number, note: string | null, requestId: string): Promise<Balance> {
    const { data, error } = await this.supabase.rpc('finance_transfer_reserve', {
      p_workspace_id: this.workspaceId, p_direction: direction, p_amount_cents: amountCents, p_note: note, p_request_id: requestId,
    });
    if (error) this.fail('Não foi possível transferir', error);
    this.notifier.notify();
    return toBalance(data);
  }

  async listTransfers(limit = 20): Promise<BalanceTransfer[]> {
    const { data, error } = await this.supabase.from('finance_balance_transfers').select('*')
      .eq('workspace_id', this.workspaceId).order('created_at', { ascending: false }).limit(limit);
    if (error) this.fail('Não foi possível carregar o histórico de transferências', error);
    return (data ?? []).map(toTransfer);
  }

  // ---------------------------------------------------------- recebimentos
  async listReceivables(): Promise<Receivable[]> {
    const { data, error } = await this.supabase.from('finance_receivables').select('*')
      .eq('workspace_id', this.workspaceId).order('expected_date');
    if (error) this.fail('Não foi possível carregar os recebimentos', error);
    return (data ?? []).map(toReceivable);
  }

  async createReceivable(input: ReceivableInputT): Promise<Receivable> {
    const { data, error } = await this.supabase.from('finance_receivables').insert({
      workspace_id: this.workspaceId, description: input.description, amount_cents: input.amountCents,
      expected_date: input.expectedDate, status: input.status, notes: input.notes || null,
    }).select().single();
    if (error) this.fail('Não foi possível salvar o recebimento', error);
    this.notifier.notify();
    return toReceivable(data);
  }

  async updateReceivable(id: string, input: Partial<Omit<ReceivableInputT, 'status'>> & { status?: 'confirmed' | 'uncertain' | 'cancelled' }): Promise<void> {
    const patch: Row = {};
    if (input.description !== undefined) patch.description = input.description;
    if (input.amountCents !== undefined) patch.amount_cents = input.amountCents;
    if (input.expectedDate !== undefined) patch.expected_date = input.expectedDate;
    if (input.status !== undefined) patch.status = input.status;
    if (input.notes !== undefined) patch.notes = input.notes || null;
    const { error } = await this.supabase.from('finance_receivables').update(patch).eq('id', id).eq('workspace_id', this.workspaceId);
    if (error) this.fail('Não foi possível atualizar o recebimento', error);
    this.notifier.notify();
  }

  async markReceived(id: string, addToBalance: boolean): Promise<void> {
    const { error } = await this.supabase.rpc('finance_mark_receivable_received', { p_receivable_id: id, p_add_to_balance: addToBalance });
    if (error) this.fail('Não foi possível marcar como recebido', error);
    this.notifier.notify();
  }

  // ----------------------------------------------------------- compromissos
  async listCommitments(): Promise<Commitment[]> {
    const { data, error } = await this.supabase.from('finance_commitments').select('*')
      .eq('workspace_id', this.workspaceId).order('created_at');
    if (error) this.fail('Não foi possível carregar os compromissos', error);
    return (data ?? []).map(toCommitment);
  }

  private commitmentRow(input: CommitmentInputT): Row {
    return {
      description: input.description, amount_cents: input.amountCents, recurrence: input.recurrence,
      due_date: input.recurrence === 'none' ? input.dueDate : null,
      day_of_month: input.recurrence === 'monthly' ? input.dayOfMonth : null,
      start_month: input.startMonth, end_month: input.recurrence === 'monthly' ? input.endMonth : null,
      billing: input.billing, card: input.billing === 'card' ? input.card : null, category: input.category || null,
    };
  }

  async createCommitment(input: CommitmentInputT): Promise<Commitment> {
    const { data, error } = await this.supabase.from('finance_commitments')
      .insert({ workspace_id: this.workspaceId, ...this.commitmentRow(input) }).select().single();
    if (error) this.fail('Não foi possível salvar o compromisso', error);
    this.notifier.notify();
    return toCommitment(data);
  }

  async updateCommitment(id: string, input: CommitmentInputT): Promise<void> {
    const { error } = await this.supabase.from('finance_commitments').update(this.commitmentRow(input))
      .eq('id', id).eq('workspace_id', this.workspaceId);
    if (error) this.fail('Não foi possível atualizar o compromisso', error);
    this.notifier.notify();
  }

  async setCommitmentActive(id: string, active: boolean): Promise<void> {
    const { error } = await this.supabase.from('finance_commitments').update({ active }).eq('id', id).eq('workspace_id', this.workspaceId);
    if (error) this.fail('Não foi possível alterar o compromisso', error);
    this.notifier.notify();
  }

  async listOccurrences(): Promise<Occurrence[]> {
    const { data, error } = await this.supabase.from('finance_commitment_occurrences').select('*').eq('workspace_id', this.workspaceId);
    if (error) this.fail('Não foi possível carregar os pagamentos dos compromissos', error);
    return (data ?? []).map(toOccurrence);
  }

  async setOccurrence(commitmentId: string, month: MonthKey, patch: { amountCents?: number | null; status?: Occurrence['status'] }): Promise<void> {
    const row: Row = { workspace_id: this.workspaceId, commitment_id: commitmentId, month };
    if (patch.amountCents !== undefined) row.amount_cents = patch.amountCents;
    if (patch.status !== undefined) row.status = patch.status;
    const { error } = await this.supabase.from('finance_commitment_occurrences').upsert(row, { onConflict: 'commitment_id,month' });
    if (error) this.fail('Não foi possível atualizar o compromisso do mês', error);
    this.notifier.notify();
  }

  async markCommitmentPaid(commitmentId: string, month: MonthKey, deductFromBalance: boolean): Promise<void> {
    const { error } = await this.supabase.rpc('finance_mark_commitment_paid', {
      p_commitment_id: commitmentId, p_month: month, p_deduct_from_balance: deductFromBalance,
    });
    if (error) this.fail('Não foi possível marcar como pago', error);
    this.notifier.notify();
  }

  // --------------------------------------------------------------- faturas
  async listInvoices(): Promise<CardInvoice[]> {
    const { data, error } = await this.supabase.from('finance_card_invoices').select('*')
      .eq('workspace_id', this.workspaceId).order('month', { ascending: false });
    if (error) this.fail('Não foi possível carregar as faturas', error);
    return (data ?? []).map(toInvoice);
  }

  async saveInvoiceManual(input: InvoiceManualInputT): Promise<void> {
    const row: Row = {
      workspace_id: this.workspaceId, card: input.card, month: input.month,
      manual_amount_cents: input.amountCents, due_date: input.dueDate,
    };
    if (input.status) row.status = input.status;
    const { error } = await this.supabase.from('finance_card_invoices').upsert(row, { onConflict: 'workspace_id,card,month' });
    if (error) this.fail('Não foi possível salvar a fatura', error);
    this.notifier.notify();
  }

  async setInvoiceStatus(id: string, status: 'open' | 'closed'): Promise<void> {
    const { error } = await this.supabase.from('finance_card_invoices').update({ status })
      .eq('id', id).eq('workspace_id', this.workspaceId).neq('status', 'paid');
    if (error) this.fail('Não foi possível alterar a fatura', error);
    this.notifier.notify();
  }

  async reopenInvoice(id: string): Promise<void> {
    const { error } = await this.supabase.from('finance_card_invoices').update({ status: 'closed', paid_at: null })
      .eq('id', id).eq('workspace_id', this.workspaceId).eq('status', 'paid');
    if (error) this.fail('Não foi possível reabrir a fatura', error);
    this.notifier.notify();
  }

  async markInvoicePaid(id: string, deductFromBalance: boolean): Promise<void> {
    const { error } = await this.supabase.rpc('finance_mark_invoice_paid', { p_invoice_id: id, p_deduct_from_balance: deductFromBalance });
    if (error) this.fail('Não foi possível marcar a fatura como paga', error);
    this.notifier.notify();
  }

  async listItems(invoiceId?: string): Promise<InvoiceItem[]> {
    let q = this.supabase.from('finance_invoice_items').select('*').eq('workspace_id', this.workspaceId).neq('status', 'removed');
    if (invoiceId) q = q.eq('invoice_id', invoiceId);
    const { data, error } = await q.order('purchase_date', { ascending: false });
    if (error) this.fail('Não foi possível carregar os lançamentos da fatura', error);
    return (data ?? []).map(toItem);
  }

  async linkItem(itemId: string, commitmentId: string | null): Promise<void> {
    const { error } = await this.supabase.from('finance_invoice_items').update({ commitment_id: commitmentId })
      .eq('id', itemId).eq('workspace_id', this.workspaceId);
    if (error) this.fail('Não foi possível vincular o lançamento', error);
    this.notifier.notify();
  }

  async resolveMissingItem(itemId: string, action: 'keep' | 'remove'): Promise<void> {
    const { error } = await this.supabase.rpc('finance_resolve_missing_item', { p_item_id: itemId, p_action: action });
    if (error) this.fail('Não foi possível revisar o lançamento', error);
    this.notifier.notify();
  }

  async listImports(invoiceId: string): Promise<InvoiceImportRecord[]> {
    const { data, error } = await this.supabase.from('finance_invoice_imports').select('*')
      .eq('workspace_id', this.workspaceId).eq('invoice_id', invoiceId).order('created_at', { ascending: false }).limit(10);
    if (error) this.fail('Não foi possível carregar o histórico de importações', error);
    return (data ?? []).map(toImport);
  }

  /** Avisa as telas que uma importação (feita via API) mudou os dados. */
  notifyChanged(): void {
    this.notifier.notify();
  }
}

export type { CardId };

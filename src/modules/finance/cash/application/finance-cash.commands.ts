import type { EventRepository } from '@/platform/events/event.repository';
import type { SupabaseFinanceCashRepository } from '../infrastructure/supabase-finance-cash.repository';
import {
  CommitmentInput, InvoiceManualInput, ReceivableInput, SetBalanceInput, TransferInput,
  type CommitmentInputT, type InvoiceManualInputT, type ReceivableInputT, type SetBalanceInputT, type TransferInputT,
} from '../domain/cash.schema';
import type { MonthKey } from '../domain/month';

/**
 * Commands do caixa: validam com Zod, delegam ao repositório (funções SQL
 * transacionais quando há saldo envolvido) e emitem eventos de domínio SEM
 * valores monetários no payload (dado financeiro não vai para a trilha de
 * eventos).
 */
export class FinanceCashCommands {
  constructor(
    private repo: SupabaseFinanceCashRepository,
    private eventRepo: EventRepository,
    private workspaceId: string
  ) {}

  private async emit(type: string, entityId: string, payload: Record<string, unknown> = {}) {
    await this.eventRepo.save({
      id: crypto.randomUUID(), type, entityId, workspaceId: this.workspaceId, source: 'manual',
      payload, createdAt: new Date().toISOString(),
    });
  }

  async setBalance(input: SetBalanceInputT) {
    const v = SetBalanceInput.parse(input);
    const balance = await this.repo.setBalance(v.availableCents ?? null, v.reserveCents ?? null);
    await this.emit('finance.balance_updated', this.workspaceId, {
      available: v.availableCents !== undefined, reserve: v.reserveCents !== undefined,
    });
    return balance;
  }

  async transfer(input: TransferInputT) {
    const v = TransferInput.parse(input);
    const balance = await this.repo.transfer(v.direction, v.amountCents, v.note ?? null, v.requestId);
    await this.emit('finance.reserve_transferred', v.requestId, { direction: v.direction });
    return balance;
  }

  async createReceivable(input: ReceivableInputT) {
    const created = await this.repo.createReceivable(ReceivableInput.parse(input));
    await this.emit('finance.receivable_created', created.id);
    return created;
  }

  async updateReceivable(id: string, input: ReceivableInputT) {
    await this.repo.updateReceivable(id, ReceivableInput.parse(input));
    await this.emit('finance.receivable_updated', id);
  }

  async cancelReceivable(id: string) {
    await this.repo.updateReceivable(id, { status: 'cancelled' });
    await this.emit('finance.receivable_cancelled', id);
  }

  async setReceivableCertainty(id: string, status: 'confirmed' | 'uncertain') {
    await this.repo.updateReceivable(id, { status });
    await this.emit('finance.receivable_updated', id);
  }

  /** `addToBalance`: soma ao saldo; desligue se o saldo já foi atualizado depois do recebimento. */
  async markReceived(id: string, addToBalance: boolean) {
    await this.repo.markReceived(id, addToBalance);
    await this.emit('finance.receivable_received', id, { addedToBalance: addToBalance });
  }

  async createCommitment(input: CommitmentInputT) {
    const created = await this.repo.createCommitment(CommitmentInput.parse(input));
    await this.emit('finance.commitment_created', created.id);
    return created;
  }

  async updateCommitment(id: string, input: CommitmentInputT) {
    await this.repo.updateCommitment(id, CommitmentInput.parse(input));
    await this.emit('finance.commitment_updated', id);
  }

  async archiveCommitment(id: string) {
    await this.repo.setCommitmentActive(id, false);
    await this.emit('finance.commitment_archived', id);
  }

  async markCommitmentPaid(commitmentId: string, month: MonthKey, deductFromBalance: boolean) {
    await this.repo.markCommitmentPaid(commitmentId, month, deductFromBalance);
    await this.emit('finance.commitment_paid', commitmentId, { month, deductedFromBalance: deductFromBalance });
  }

  async setOccurrenceAmount(commitmentId: string, month: MonthKey, amountCents: number | null) {
    if (amountCents !== null && (!Number.isInteger(amountCents) || amountCents <= 0)) throw new Error('O valor deve ser maior que zero.');
    await this.repo.setOccurrence(commitmentId, month, { amountCents });
    await this.emit('finance.commitment_amount_changed', commitmentId, { month });
  }

  async setIncludedInInvoice(commitmentId: string, month: MonthKey, included: boolean) {
    await this.repo.setOccurrence(commitmentId, month, { status: included ? 'included_in_invoice' : 'pending' });
    await this.emit('finance.commitment_inclusion_changed', commitmentId, { month, included });
  }

  async saveInvoiceManual(input: InvoiceManualInputT) {
    await this.repo.saveInvoiceManual(InvoiceManualInput.parse(input));
    await this.emit('finance.invoice_saved', `${input.card}:${input.month}`);
  }

  async setInvoiceStatus(id: string, status: 'open' | 'closed') {
    await this.repo.setInvoiceStatus(id, status);
    await this.emit('finance.invoice_status_changed', id, { status });
  }

  async reopenInvoice(id: string) {
    await this.repo.reopenInvoice(id);
    await this.emit('finance.invoice_reopened', id);
  }

  async markInvoicePaid(id: string, deductFromBalance: boolean) {
    await this.repo.markInvoicePaid(id, deductFromBalance);
    await this.emit('finance.invoice_paid', id, { deductedFromBalance: deductFromBalance });
  }

  /** Revisão de lançamento ausente do último CSV: 'keep' confirma, 'remove' tira da fatura. */
  async resolveMissingItem(itemId: string, action: 'keep' | 'remove') {
    await this.repo.resolveMissingItem(itemId, action);
    await this.emit('finance.invoice_item_reviewed', itemId, { action });
  }

  async linkInvoiceItem(itemId: string, commitmentId: string | null) {
    await this.repo.linkItem(itemId, commitmentId);
    await this.emit('finance.invoice_item_linked', itemId, { linked: commitmentId !== null });
  }
}

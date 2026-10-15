import type { CardId, MonthKey } from './month';
import type { InvoiceItemKind } from './nubank-invoice-csv';
import type { InvoiceStatus, OccurrenceStatus, ReceivableStatus } from './projection';

export interface Balance {
  availableCents: number;
  reserveCents: number;
  availableUpdatedAt: string | null;
  reserveUpdatedAt: string | null;
}

export interface BalanceTransfer {
  id: string;
  direction: 'reserve_to_available' | 'available_to_reserve';
  amountCents: number;
  note: string | null;
  createdAt: string;
}

export interface Receivable {
  id: string;
  description: string;
  amountCents: number;
  expectedDate: string;
  status: ReceivableStatus;
  notes: string | null;
  receivedAt: string | null;
}

export interface Commitment {
  id: string;
  description: string;
  amountCents: number;
  recurrence: 'none' | 'monthly';
  dueDate: string | null;
  dayOfMonth: number | null;
  startMonth: MonthKey;
  endMonth: MonthKey | null;
  billing: 'direct' | 'card';
  card: CardId | null;
  category: string | null;
  active: boolean;
}

export interface Occurrence {
  id: string;
  commitmentId: string;
  month: MonthKey;
  amountCents: number | null;
  status: OccurrenceStatus;
}

export interface CardInvoice {
  id: string;
  card: CardId;
  month: MonthKey;
  status: InvoiceStatus;
  manualAmountCents: number | null;
  importedAmountCents: number | null;
  dueDate: string | null;
  paidAt: string | null;
  lastImportedAt: string | null;
  rev: number;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  date: string;
  description: string;
  normalizedDescription: string;
  amountCents: number;
  kind: InvoiceItemKind;
  occurrenceIndex: number;
  installmentNo: number | null;
  installmentTotal: number | null;
  baseDescription: string;
  status: 'active' | 'missing' | 'removed';
  commitmentId: string | null;
  reviewNote: string | null;
}

export interface InvoiceImportRecord {
  id: string;
  invoiceId: string;
  fileName: string;
  rowCount: number;
  recognizedCount: number;
  newCount: number;
  changedCount: number;
  missingCount: number;
  createdAt: string;
}

/** Valor efetivo da fatura: importado (itens) tem prioridade sobre o manual. */
export function effectiveInvoiceAmount(inv: Pick<CardInvoice, 'importedAmountCents' | 'manualAmountCents'>): number | null {
  return inv.importedAmountCents ?? inv.manualAmountCents;
}

/** Há divergência entre o valor manual e o importado? */
export function invoiceAmountsDiverge(inv: Pick<CardInvoice, 'importedAmountCents' | 'manualAmountCents'>): boolean {
  return inv.importedAmountCents !== null && inv.manualAmountCents !== null && inv.importedAmountCents !== inv.manualAmountCents;
}

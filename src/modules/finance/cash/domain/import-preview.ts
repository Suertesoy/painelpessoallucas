import type { CardId, MonthKey } from './month';
import type { InvoiceItemKind } from './nubank-invoice-csv';
import type { ImportDecisions } from './import-plan';

export interface PreviewItem {
  date: string;
  description: string;
  amountCents: number;
  kind: InvoiceItemKind;
}

export interface ImportPreview {
  fileName: string;
  fileSha256: string;
  card: CardId;
  month: MonthKey;
  suggestedMonth: MonthKey | null;
  suggestedDueDate: string | null;
  parseErrors: { line: number; message: string }[];
  invoice: {
    id: string | null;
    status: 'open' | 'closed' | 'paid';
    rev: number;
    amountBeforeCents: number | null;
    manualAmountCents: number | null;
    lastImportedAt: string | null;
  };
  counts: { rows: number; recognized: number; new: number; updated: number; ambiguous: number; divergences: number; missing: number };
  /** Atualizações de data seguras, aplicadas sem decisão. */
  updatedItems: { basis: 'installment' | 'single_match'; before: PreviewItem; after: PreviewItem }[];
  /** Lançamentos antigos com mais de um candidato no arquivo: nada foi casado. */
  ambiguousItems: PreviewItem[];
  /** Valor da fatura se todas as divergências forem "o mesmo lançamento". */
  amountAfterCents: number;
  paymentsInFileCents: number;
  newItems: PreviewItem[];
  divergences: {
    key: string;
    reason: 'amount_changed' | 'date_changed';
    existing: PreviewItem;
    incoming: PreviewItem;
  }[];
  missing: { id: string; item: PreviewItem }[];
  paymentMatches: { description: string; amountCents: number; invoiceId: string; invoiceLabel: string }[];
  linkSuggestions: {
    ref: string;
    item: PreviewItem;
    commitmentId: string;
    commitmentDescription: string;
    confidence: 'high' | 'low';
    reason: 'name_and_amount' | 'name_only' | 'amount_only';
  }[];
  /** Maioria das compras do arquivo já existe, idêntica, em OUTRA fatura: possível destino errado (cartão/mês). */
  possibleWrongTarget: { invoiceLabel: string; matchedRows: number; totalRows: number } | null;
  /** Nada a fazer: arquivo já refletido na fatura. */
  noChanges: boolean;
}

export interface ConfirmPayload {
  requestId: string;
  expectedRev: number;
  newStatus: 'open' | 'closed' | null;
  dueDate: string | null;
  decisions: ImportDecisions;
  links: { ref: string; commitmentId: string }[];
  payInvoiceIds: string[];
}

export interface ConfirmResult {
  invoiceId: string;
  alreadyApplied: boolean;
  counts: { rows: number; recognized: number; new: number; changed: number; missing: number };
  /** Lançamentos classificados por regras aprendidas logo após a importação. */
  categorizedByRules?: number;
}

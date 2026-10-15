import { addMonths, compareMonths, dateInMonth, monthOf, type CardId, type MonthKey } from './month';

/**
 * Motor de projeção do caixa — função pura, sem acesso a banco ou relógio.
 *
 * Semântica (documentada também na interface):
 *  - O saldo disponível é uma FOTO manual. Só entram na projeção itens
 *    AINDA PENDENTES (recebimento não recebido, conta não paga, fatura não
 *    paga); o que já foi marcado como feito sai da conta, então atualizar o
 *    saldo à mão nunca soma de novo um recebimento já incorporado.
 *  - A reserva NUNCA entra aqui.
 *  - Cada mês começa com o resultado do anterior, INCLUSIVE déficit: uma
 *    falta não some sozinha; só deixa de existir quando é coberta (novos
 *    recebimentos) ou quando o saldo é ajustado explicitamente.
 *  - Só obrigações CONHECIDAS. Gastos ainda não lançados não são estimados.
 *  - Recebimentos incertos ficam fora dos totais.
 */

export type ReceivableStatus = 'confirmed' | 'uncertain' | 'received' | 'cancelled';
export type InvoiceStatus = 'open' | 'closed' | 'paid';
export type OccurrenceStatus = 'pending' | 'paid' | 'included_in_invoice' | 'skipped';

export interface ReceivableInput {
  id: string;
  description: string;
  amountCents: number;
  expectedDate: string;
  status: ReceivableStatus;
}

export interface CommitmentInput {
  id: string;
  description: string;
  amountCents: number;
  recurrence: 'none' | 'monthly';
  /** Vencimento do compromisso avulso. */
  dueDate: string | null;
  /** Dia do mês do compromisso recorrente. */
  dayOfMonth: number | null;
  startMonth: MonthKey;
  endMonth: MonthKey | null;
  billing: 'direct' | 'card';
  card: CardId | null;
  active: boolean;
}

export interface OccurrenceInput {
  commitmentId: string;
  month: MonthKey;
  amountCents: number | null;
  status: OccurrenceStatus;
}

export interface InvoiceInput {
  id: string;
  card: CardId;
  month: MonthKey; // mês de vencimento
  status: InvoiceStatus;
  /** Valor efetivo (importado, senão manual); null = sem valor informado. */
  amountCents: number | null;
  dueDate: string | null;
  /** Lançamentos ausentes do último CSV, aguardando revisão (continuam contando). */
  missingItemsCount?: number;
}

export interface ProjectionInput {
  today: string;
  /** Quantidade de meses exibidos, contando o mês atual. */
  months: number;
  availableCents: number;
  receivables: readonly ReceivableInput[];
  commitments: readonly CommitmentInput[];
  occurrences: readonly OccurrenceInput[];
  invoices: readonly InvoiceInput[];
  /** `${commitmentId}|${card}|${month}` já vinculados a um item importado. */
  linkedCommitmentMonths: ReadonlySet<string>;
}

export type CardFixedState = 'reconciled' | 'manual_included' | 'not_found_in_invoice' | 'awaiting_invoice';

export interface MonthLine {
  id: string;
  label: string;
  amountCents: number;
  date: string | null;
  overdue: boolean;
}

export interface CardFixedLine extends MonthLine {
  card: CardId;
  state: CardFixedState;
  /** Quanto esta linha soma no total do mês (só 'awaiting_invoice'). */
  countedCents: number;
}

export interface MonthProjection {
  month: MonthKey;
  isCurrent: boolean;
  openingCents: number;
  receipts: MonthLine[];
  receiptsCents: number;
  uncertainReceipts: MonthLine[];
  uncertainReceiptsCents: number;
  directLines: MonthLine[];
  directCents: number;
  invoiceLines: (MonthLine & { card: CardId; invoiceId: string; hasAmount: boolean })[];
  invoicesCents: number;
  cardFixedLines: CardFixedLine[];
  cardFixedEstimatedCents: number;
  committedCents: number;
  resultCents: number;
  needCents: number;
  warnings: string[];
}

export function occurrenceKey(commitmentId: string, month: MonthKey): string {
  return `${commitmentId}|${month}`;
}

export function linkedKey(commitmentId: string, card: CardId, month: MonthKey): string {
  return `${commitmentId}|${card}|${month}`;
}

interface Occurrence {
  commitment: CommitmentInput;
  month: MonthKey;
  date: string;
  amountCents: number;
  status: OccurrenceStatus;
}

function expandOccurrences(
  commitment: CommitmentInput,
  lastMonth: MonthKey,
  overrides: Map<string, OccurrenceInput>
): Occurrence[] {
  if (!commitment.active) return [];
  const result: Occurrence[] = [];
  const push = (month: MonthKey, date: string) => {
    const override = overrides.get(occurrenceKey(commitment.id, month));
    result.push({
      commitment,
      month,
      date,
      amountCents: override?.amountCents ?? commitment.amountCents,
      status: override?.status ?? 'pending',
    });
  };
  if (commitment.recurrence === 'none') {
    if (!commitment.dueDate) return [];
    const month = monthOf(commitment.dueDate);
    // Avulso vencido em mês anterior à janela entra como atrasado no mês atual.
    push(month, commitment.dueDate);
    return result;
  }
  const day = commitment.dayOfMonth ?? 1;
  // Parte do mês inicial (mesmo anterior à janela) para detectar atrasos.
  let month = commitment.startMonth;
  while (compareMonths(month, lastMonth) <= 0) {
    if (!commitment.endMonth || compareMonths(month, commitment.endMonth) <= 0) {
      push(month, dateInMonth(month, day));
    }
    month = addMonths(month, 1);
  }
  return result;
}

export function projectCash(input: ProjectionInput): MonthProjection[] {
  const currentMonth = monthOf(input.today);
  const lastMonth = addMonths(currentMonth, input.months - 1);
  const overrides = new Map(input.occurrences.map((o) => [occurrenceKey(o.commitmentId, o.month), o]));
  const occurrences = input.commitments.flatMap((c) => expandOccurrences(c, lastMonth, overrides));
  const invoiceByCardMonth = new Map(input.invoices.map((i) => [`${i.card}|${i.month}`, i]));

  const bucketMonth = (month: MonthKey): MonthKey => (compareMonths(month, currentMonth) < 0 ? currentMonth : month);
  const isOverdueDate = (date: string | null, month: MonthKey) =>
    compareMonths(month, currentMonth) < 0 || (month === currentMonth && date !== null && date < input.today);

  const projections: MonthProjection[] = [];
  // Saldo negativo informado manualmente é respeitado no mês atual.
  let opening = input.availableCents;

  for (let k = 0; k < input.months; k += 1) {
    const month = addMonths(currentMonth, k);
    const warnings: string[] = [];

    const receivablesHere = input.receivables.filter(
      (r) => (r.status === 'confirmed' || r.status === 'uncertain') && bucketMonth(monthOf(r.expectedDate)) === month
    );
    const toLine = (r: ReceivableInput): MonthLine => ({
      id: r.id,
      label: r.description,
      amountCents: r.amountCents,
      date: r.expectedDate,
      overdue: isOverdueDate(r.expectedDate, monthOf(r.expectedDate)),
    });
    const receipts = receivablesHere.filter((r) => r.status === 'confirmed').map(toLine);
    const uncertainReceipts = receivablesHere.filter((r) => r.status === 'uncertain').map(toLine);

    const directLines: MonthLine[] = [];
    const cardFixedLines: CardFixedLine[] = [];
    for (const occ of occurrences) {
      if (bucketMonth(occ.month) !== month) continue;
      if (occ.status === 'paid' || occ.status === 'skipped') continue;
      const base: MonthLine = {
        id: occ.commitment.id,
        label: occ.commitment.description,
        amountCents: occ.amountCents,
        date: occ.date,
        overdue: isOverdueDate(occ.date, occ.month),
      };
      if (occ.commitment.billing === 'direct') {
        if (occ.status === 'included_in_invoice') continue;
        directLines.push(base);
        continue;
      }
      const card = occ.commitment.card;
      if (!card) {
        warnings.push(`"${occ.commitment.description}" está marcado como cartão, mas sem cartão definido.`);
        continue;
      }
      const invoice = invoiceByCardMonth.get(`${card}|${occ.month}`);
      let state: CardFixedState;
      if (input.linkedCommitmentMonths.has(linkedKey(occ.commitment.id, card, occ.month))) state = 'reconciled';
      else if (occ.status === 'included_in_invoice') state = 'manual_included';
      else if (invoice && invoice.status !== 'open') state = 'not_found_in_invoice';
      else state = 'awaiting_invoice';
      cardFixedLines.push({
        ...base,
        card,
        state,
        countedCents: state === 'awaiting_invoice' ? occ.amountCents : 0,
      });
    }

    const invoiceLines: MonthProjection['invoiceLines'] = [];
    for (const inv of input.invoices) {
      if (inv.status === 'paid' || bucketMonth(inv.month) !== month) continue;
      invoiceLines.push({
        id: inv.id,
        invoiceId: inv.id,
        card: inv.card,
        label: `Fatura ${inv.card === 'nubank_1' ? 'Nubank 1' : 'Nubank 2'}`,
        amountCents: inv.amountCents ?? 0,
        hasAmount: inv.amountCents !== null,
        date: inv.dueDate,
        overdue: isOverdueDate(inv.dueDate, inv.month),
      });
      if (inv.missingItemsCount) {
        warnings.push(
          `${inv.card === 'nubank_1' ? 'Nubank 1' : 'Nubank 2'}: ${inv.missingItemsCount} lançamento(s) sumiram do último CSV e seguem somados até você revisar.`
        );
      }
      if (inv.amountCents === null) warnings.push(`A fatura ${inv.card === 'nubank_1' ? 'Nubank 1' : 'Nubank 2'} deste mês ainda não tem valor informado.`);
    }

    const sum = (lines: readonly { amountCents: number }[]) => lines.reduce((s, l) => s + l.amountCents, 0);
    const receiptsCents = sum(receipts);
    const directCents = sum(directLines);
    const invoicesCents = sum(invoiceLines);
    const cardFixedEstimatedCents = cardFixedLines.reduce((s, l) => s + l.countedCents, 0);
    const committedCents = directCents + invoicesCents + cardFixedEstimatedCents;
    const resultCents = opening + receiptsCents - committedCents;

    if (cardFixedLines.some((l) => l.state === 'not_found_in_invoice')) {
      warnings.push('Há gastos fixos no cartão que não foram encontrados na fatura fechada. Confira.');
    }

    projections.push({
      month,
      isCurrent: k === 0,
      openingCents: opening,
      receipts,
      receiptsCents,
      uncertainReceipts,
      uncertainReceiptsCents: sum(uncertainReceipts),
      directLines,
      directCents,
      invoiceLines,
      invoicesCents,
      cardFixedLines,
      cardFixedEstimatedCents,
      committedCents,
      resultCents,
      needCents: Math.max(0, -resultCents),
      warnings,
    });

    opening = resultCents;
  }

  return projections;
}

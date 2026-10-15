import { addMonths, CARD_FULL_LABELS, compareMonths, dateInMonth, monthOf, type CardId, type MonthKey } from './month';

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
export type IncomeOccurrenceStatus = 'pending' | 'received' | 'cancelled';

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

/** Entrada fixa: receita mensal recorrente, com término opcional (inclusivo). */
export interface FixedIncomeInput {
  id: string;
  description: string;
  amountCents: number;
  dayOfMonth: number;
  startMonth: MonthKey;
  endMonth: MonthKey | null;
  active: boolean;
}

export interface IncomeOccurrenceInput {
  incomeId: string;
  month: MonthKey;
  amountCents: number | null;
  status: IncomeOccurrenceStatus;
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
  /** Entradas fixas e suas exceções mensais (opcionais). */
  fixedIncomes?: readonly FixedIncomeInput[];
  incomeOccurrences?: readonly IncomeOccurrenceInput[];
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
  /** Recebimentos PONTUAIS confirmados e ainda não recebidos. */
  receipts: MonthLine[];
  receiptsCents: number;
  /** Ocorrências de entradas fixas previstas e ainda não recebidas. */
  fixedIncomeLines: MonthLine[];
  fixedIncomeCents: number;
  /** Total que entra na conta do mês: pontuais confirmados + entradas fixas. */
  inflowCents: number;
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

function sharesWord(a: string, b: string): boolean {
  const words = (s: string) => new Set(s.toLowerCase().split(/[^p{L}p{N}]+/u).filter((w) => w.length >= 5));
  const wb = words(b);
  return [...words(a)].some((w) => wb.has(w));
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

function expandIncome(
  income: FixedIncomeInput,
  lastMonth: MonthKey,
  overrides: Map<string, IncomeOccurrenceInput>
): { income: FixedIncomeInput; month: MonthKey; date: string; amountCents: number; status: IncomeOccurrenceStatus }[] {
  if (!income.active) return [];
  const out: ReturnType<typeof expandIncome> = [];
  let month = income.startMonth;
  while (compareMonths(month, lastMonth) <= 0) {
    // Término inclusivo: o mês final ainda tem ocorrência.
    if (income.endMonth && compareMonths(month, income.endMonth) > 0) break;
    const o = overrides.get(occurrenceKey(income.id, month));
    out.push({ income, month, date: dateInMonth(month, income.dayOfMonth), amountCents: o?.amountCents ?? income.amountCents, status: o?.status ?? 'pending' });
    month = addMonths(month, 1);
  }
  return out;
}

export interface IncomeMonthRow {
  incomeId: string;
  description: string;
  month: MonthKey;
  date: string;
  amountCents: number;
  status: IncomeOccurrenceStatus;
  hasAmountOverride: boolean;
}

/** Ocorrências de entradas fixas de UM mês, em qualquer estado (para exibição e ações). */
export function incomeOccurrencesInMonth(
  month: MonthKey,
  incomes: readonly FixedIncomeInput[],
  occurrences: readonly IncomeOccurrenceInput[]
): IncomeMonthRow[] {
  const overrides = new Map(occurrences.map((o) => [occurrenceKey(o.incomeId, o.month), o]));
  return incomes
    .flatMap((i) => expandIncome(i, month, overrides))
    .filter((o) => o.month === month)
    .map((o) => ({
      incomeId: o.income.id,
      description: o.income.description,
      month: o.month,
      date: o.date,
      amountCents: o.amountCents,
      status: o.status,
      hasAmountOverride: overrides.get(occurrenceKey(o.income.id, o.month))?.amountCents != null,
    }));
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
  const incomeOverrides = new Map((input.incomeOccurrences ?? []).map((o) => [occurrenceKey(o.incomeId, o.month), o]));
  const incomeOccurrences = (input.fixedIncomes ?? []).flatMap((i) => expandIncome(i, lastMonth, incomeOverrides));
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

    // Só ocorrências PENDENTES entram: o que já foi recebido está no saldo
    // e o cancelado não vai acontecer. Pendentes de meses anteriores são
    // atrasados e entram no mês atual.
    const fixedIncomeLines: MonthLine[] = incomeOccurrences
      .filter((o) => o.status === 'pending' && bucketMonth(o.month) === month)
      .map((o) => ({
        id: o.income.id,
        label: o.income.description,
        amountCents: o.amountCents,
        date: o.date,
        overdue: isOverdueDate(o.date, o.month),
      }));

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
        label: `Fatura ${CARD_FULL_LABELS[inv.card]}`,
        amountCents: inv.amountCents ?? 0,
        hasAmount: inv.amountCents !== null,
        date: inv.dueDate,
        overdue: isOverdueDate(inv.dueDate, inv.month),
      });
      if (inv.missingItemsCount) {
        warnings.push(
          `${CARD_FULL_LABELS[inv.card]}: ${inv.missingItemsCount} lançamento(s) sumiram do último CSV e seguem somados até você revisar.`
        );
      }
      if (inv.amountCents === null) warnings.push(`A fatura ${CARD_FULL_LABELS[inv.card]} deste mês ainda não tem valor informado.`);
    }

    const sum = (lines: readonly { amountCents: number }[]) => lines.reduce((s, l) => s + l.amountCents, 0);
    const receiptsCents = sum(receipts);
    const fixedIncomeCents = sum(fixedIncomeLines);
    const inflowCents = receiptsCents + fixedIncomeCents;
    const directCents = sum(directLines);
    const invoicesCents = sum(invoiceLines);
    const cardFixedEstimatedCents = cardFixedLines.reduce((s, l) => s + l.countedCents, 0);
    const committedCents = directCents + invoicesCents + cardFixedEstimatedCents;
    const resultCents = opening + inflowCents - committedCents;

    // Possível duplicidade: recebimento pontual parecido com entrada fixa do mesmo mês.
    for (const r of receipts) {
      const twin = fixedIncomeLines.find((f) => f.amountCents === r.amountCents || sharesWord(f.label, r.label));
      if (twin) {
        warnings.push(`"${r.label}" (pontual) parece repetir a entrada fixa "${twin.label}" neste mês. Confira para não contar duas vezes.`);
      }
    }

    if (cardFixedLines.some((l) => l.state === 'not_found_in_invoice')) {
      warnings.push('Há gastos fixos no cartão que não foram encontrados na fatura fechada. Confira.');
    }

    projections.push({
      month,
      isCurrent: k === 0,
      openingCents: opening,
      receipts,
      receiptsCents,
      fixedIncomeLines,
      fixedIncomeCents,
      inflowCents,
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

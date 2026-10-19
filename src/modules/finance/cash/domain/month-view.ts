import {
  CARD_IDS, addMonths, monthOf, monthsBetween, type CardId, type MonthKey,
} from './month';
import {
  classifyCardFixed, expandIncome, expandOccurrences, linkedKey, occurrenceKey, projectCash,
  type CardFixedState, type InvoiceInput, type MonthProjection, type ProjectionInput,
} from './projection';
import { estimateCardSpending, type CardEstimate } from './card-estimate';
import { staleUnpaidInvoices, sustainabilityOfMonth, type MonthSustainability } from './sustainability';
import { projectFutureInstallments } from './installments';
import { resolveCardGoal, type CardGoal, type ResolvedCardGoal } from './card-goals';
import {
  effectiveInvoiceAmount,
  type Balance, type CardInvoice, type Commitment, type FixedIncome, type IncomeOccurrence, type InvoiceItem, type Occurrence, type Receivable,
} from './types';

/**
 * Visão de UM mês qualquer (passado, atual ou futuro) — função pura.
 *
 * É a única fonte dos números da tela de Finanças: o cabeçalho escolhe o mês e
 * TODAS as seções (entradas, compromissos, faturas, parcelas, meta, resultado,
 * sustentabilidade) leem desta mesma visão, então nenhuma fica presa ao mês atual.
 *
 * Dois conceitos que nunca se misturam:
 *  - RESULTADO DO MÊS INTEIRO: tudo o que pertence ao mês (recebido e previsto,
 *    pago e pendente), independentemente de hoje. É histórico/planejamento.
 *  - CAIXA RESTANTE: saldo informado hoje + o que ainda está pendente. Só existe
 *    do mês atual em diante; o que já foi pago/recebido não é movimentado de novo.
 *    Para meses encerrados não se reconstrói um saldo bancário de época.
 */

export const MAX_FUTURE_MONTHS = 36;
export const MAX_PAST_MONTHS = 60;

export interface MonthViewSource {
  today: string;
  balance: Balance;
  receivables: readonly Receivable[];
  fixedIncomes: readonly FixedIncome[];
  incomeOccurrences: readonly IncomeOccurrence[];
  commitments: readonly Commitment[];
  occurrences: readonly Occurrence[];
  invoices: readonly CardInvoice[];
  items: readonly InvoiceItem[];
  goals: readonly CardGoal[];
}

export type EntryState = 'done' | 'pending' | 'cancelled';

export interface MonthEntry {
  /** Id da origem (entrada fixa, recebimento ou compromisso). */
  id: string;
  label: string;
  amountCents: number;
  date: string | null;
  /** Mês de origem do lançamento. */
  month: MonthKey;
  state: EntryState;
  overdue: boolean;
  /** Pendência de mês anterior que ainda pesa no caixa de hoje (fora do resultado deste mês). */
  carriedOver: boolean;
  uncertain?: boolean;
  card?: CardId;
  cardState?: CardFixedState;
  /** Gasto fixo no cartão: quanto soma como previsto (só aguardando fatura). */
  countedCents?: number;
}

export type MonthPhase = 'past' | 'current' | 'future';

export interface CardMonth {
  card: CardId;
  invoice: CardInvoice | null;
  /** Valor efetivo da fatura (importado, senão manual); null = sem valor. */
  amountCents: number | null;
  /** complete = fechada/paga; partial = aberta (ainda recebe compras); none = sem fatura. */
  completeness: 'complete' | 'partial' | 'none';
}

export interface InstallmentLine {
  card: CardId;
  description: string;
  installmentNo: number;
  installmentTotal: number;
  amountCents: number;
}

export interface MonthGoalView {
  resolved: ResolvedCardGoal | null;
  /** Lançado nas faturas do mês (valor real, qualquer situação). Nunca inclui estimativa. */
  spentCents: number;
  basis: 'complete' | 'partial' | 'none';
  usagePercent: number | null;
  /** Quanto falta para a meta (0 se já passou). */
  remainingCents: number | null;
  overCents: number;
  /** Com a média dos cartões o mês chegaria a (hipótese); null quando não há base. */
  hypothesisCents: number | null;
  /** A meta escolhida está acima do limite sustentável calculado (aviso discreto, nunca bloqueia). */
  aboveSustainableLimit: boolean;
}

export interface MonthCash {
  kind: 'current' | 'future';
  openingCents: number;
  pendingInflowCents: number;
  pendingOutflowCents: number;
  expectedCents: number;
  warnings: string[];
}

export interface MonthView {
  month: MonthKey;
  phase: MonthPhase;
  /** closed = todas as faturas fechadas/pagas; in_progress = mês atual; incomplete = encerrado com fatura aberta/ausente; partial = futuro. */
  completeness: 'closed' | 'in_progress' | 'incomplete' | 'partial';
  incomeFixed: MonthEntry[];
  incomeOneOff: MonthEntry[];
  commitmentsDirect: MonthEntry[];
  commitmentsCard: MonthEntry[];
  cards: CardMonth[];
  /** Parcelas já lançadas nas faturas do mês (já estão dentro dos valores das faturas). */
  installmentsLaunched: InstallmentLine[];
  /** Parcelas prováveis ainda não lançadas (inferidas; informativas, fora de qualquer total). */
  installmentsInferred: InstallmentLine[];
  sustainability: MonthSustainability;
  estimate: CardEstimate;
  /** Quanto do mês já está comprometido com o que está cadastrado (diretos + faturas + fixos no cartão). */
  committedCents: number;
  committedPercentOfIncome: number | null;
  goal: MonthGoalView;
  cash: MonthCash | null;
  /** Caixa real acumulado por mês (só o registrado), do mês atual até o maior entre o escolhido e +3. */
  cashTimeline: { month: MonthKey; resultCents: number }[];
  staleInvoices: InvoiceInput[];
}

/** `${commitmentId}|${card}|${month}` já vinculados a um item importado. */
export function linkedCommitmentMonthsOf(items: readonly InvoiceItem[], invoices: readonly CardInvoice[]): Set<string> {
  const byId = new Map(invoices.map((i) => [i.id, i]));
  const linked = new Set<string>();
  for (const item of items) {
    if (!item.commitmentId || item.status === 'removed') continue;
    const inv = byId.get(item.invoiceId);
    if (inv) linked.add(linkedKey(item.commitmentId, inv.card, inv.month));
  }
  return linked;
}

export function toInvoiceInputs(invoices: readonly CardInvoice[], items: readonly InvoiceItem[]): InvoiceInput[] {
  const missing = new Map<string, number>();
  for (const item of items) {
    if (item.status === 'missing') missing.set(item.invoiceId, (missing.get(item.invoiceId) ?? 0) + 1);
  }
  return invoices.map<InvoiceInput>((i) => ({
    id: i.id, card: i.card, month: i.month, status: i.status, amountCents: effectiveInvoiceAmount(i), dueDate: i.dueDate,
    missingItemsCount: missing.get(i.id) ?? 0,
  }));
}

export function toProjectionInput(source: MonthViewSource, months: number): ProjectionInput {
  return {
    today: source.today,
    months,
    availableCents: source.balance.availableCents,
    receivables: source.receivables.map((r) => ({
      id: r.id, description: r.description, amountCents: r.amountCents, expectedDate: r.expectedDate, status: r.status,
    })),
    fixedIncomes: source.fixedIncomes.map((i) => ({ ...i })),
    incomeOccurrences: source.incomeOccurrences.map((o) => ({ incomeId: o.incomeId, month: o.month, amountCents: o.amountCents, status: o.status })),
    commitments: source.commitments.map((c) => ({ ...c })),
    occurrences: source.occurrences.map((o) => ({ commitmentId: o.commitmentId, month: o.month, amountCents: o.amountCents, status: o.status })),
    invoices: toInvoiceInputs(source.invoices, source.items),
    linkedCommitmentMonths: linkedCommitmentMonthsOf(source.items, source.invoices),
  };
}

/** O mês escolhido está dentro do que a navegação permite? */
export function clampMonth(month: MonthKey, current: MonthKey): MonthKey {
  const delta = monthsBetween(current, month);
  if (delta > MAX_FUTURE_MONTHS) return addMonths(current, MAX_FUTURE_MONTHS);
  if (delta < -MAX_PAST_MONTHS) return addMonths(current, -MAX_PAST_MONTHS);
  return month;
}

export function buildMonthView(source: MonthViewSource, requested: MonthKey): MonthView {
  const currentMonth = monthOf(source.today);
  const month = clampMonth(requested, currentMonth);
  const delta = monthsBetween(currentMonth, month);
  const phase: MonthPhase = delta < 0 ? 'past' : delta === 0 ? 'current' : 'future';

  const invoiceInputs = toInvoiceInputs(source.invoices, source.items);
  const invoiceByCardMonth = new Map(source.invoices.map((i) => [`${i.card}|${i.month}`, i]));
  const linked = linkedCommitmentMonthsOf(source.items, source.invoices);

  const isOverdue = (date: string | null, ownMonth: MonthKey) =>
    ownMonth < currentMonth || (ownMonth === currentMonth && date !== null && date < source.today);

  /* ---------------- entradas */
  const incomeOverrides = new Map(source.incomeOccurrences.map((o) => [occurrenceKey(o.incomeId, o.month), o]));
  const incomeFixed: MonthEntry[] = [];
  for (const o of source.fixedIncomes.flatMap((i) => expandIncome({ ...i }, month, incomeOverrides))) {
    const own = o.month === month;
    const carried = !own && phase === 'current' && o.month < currentMonth && o.status === 'pending';
    if (!own && !carried) continue;
    incomeFixed.push({
      id: o.income.id, label: o.income.description, amountCents: o.amountCents, date: o.date, month: o.month,
      state: o.status === 'received' ? 'done' : o.status === 'cancelled' ? 'cancelled' : 'pending',
      overdue: o.status === 'pending' && isOverdue(o.date, o.month), carriedOver: carried,
    });
  }

  const incomeOneOff: MonthEntry[] = [];
  for (const r of source.receivables) {
    const own = monthOf(r.expectedDate) === month;
    const open = r.status === 'confirmed' || r.status === 'uncertain';
    const carried = !own && phase === 'current' && monthOf(r.expectedDate) < currentMonth && open;
    if (r.status === 'cancelled' || (!own && !carried)) continue;
    incomeOneOff.push({
      id: r.id, label: r.description, amountCents: r.amountCents, date: r.expectedDate, month: monthOf(r.expectedDate),
      state: r.status === 'received' ? 'done' : 'pending',
      overdue: open && isOverdue(r.expectedDate, monthOf(r.expectedDate)), carriedOver: carried, uncertain: r.status === 'uncertain',
    });
  }

  /* ---------------- compromissos */
  const occOverrides = new Map(source.occurrences.map((o) => [occurrenceKey(o.commitmentId, o.month), o]));
  const commitmentsDirect: MonthEntry[] = [];
  const commitmentsCard: MonthEntry[] = [];
  for (const occ of source.commitments.flatMap((c) => expandOccurrences({ ...c }, month, occOverrides))) {
    const own = occ.month === month;
    const carried = !own && phase === 'current' && occ.month < currentMonth && occ.status === 'pending';
    if (!own && !carried) continue;
    if (occ.status === 'skipped') continue;
    const base: MonthEntry = {
      id: occ.commitment.id, label: occ.commitment.description, amountCents: occ.amountCents, date: occ.date, month: occ.month,
      state: occ.status === 'paid' ? 'done' : 'pending',
      overdue: occ.status === 'pending' && isOverdue(occ.date, occ.month), carriedOver: carried,
    };
    if (occ.commitment.billing === 'direct') {
      if (occ.status === 'included_in_invoice') continue;
      commitmentsDirect.push(base);
      continue;
    }
    const card = occ.commitment.card;
    if (!card || occ.status === 'paid') continue;
    const state = classifyCardFixed(occ.status, linked.has(linkedKey(occ.commitment.id, card, occ.month)), invoiceByCardMonth.get(`${card}|${occ.month}`)?.status ?? null);
    commitmentsCard.push({ ...base, state: 'pending', card, cardState: state, countedCents: state === 'awaiting_invoice' ? occ.amountCents : 0 });
  }

  /* ---------------- cartões e faturas */
  const cards: CardMonth[] = CARD_IDS.map((card) => {
    const invoice = invoiceByCardMonth.get(`${card}|${month}`) ?? null;
    return {
      card, invoice, amountCents: invoice ? effectiveInvoiceAmount(invoice) : null,
      completeness: !invoice ? 'none' : invoice.status === 'open' ? 'partial' : 'complete',
    };
  });

  /* ---------------- estimativa e sustentabilidade (um mês isolado) */
  const cardFixedHere = commitmentsCard.filter((e) => !e.carriedOver).map((e) => ({ card: e.card as CardId, countedCents: e.countedCents ?? 0 }));
  const estimate = estimateCardSpending(invoiceInputs, [{ month, cardFixedLines: cardFixedHere }], currentMonth);

  // Caixa real (só do mês atual em diante): o motor existente, com o saldo informado de hoje.
  let cash: MonthCash | null = null;
  let cashTimeline: MonthView['cashTimeline'] = [];
  let projection: MonthProjection[] = [];
  if (phase !== 'past') {
    projection = projectCash(toProjectionInput(source, Math.max(delta + 1, 4)));
    const at = projection[delta];
    cash = {
      kind: phase, openingCents: at.openingCents, pendingInflowCents: at.inflowCents,
      pendingOutflowCents: at.committedCents, expectedCents: at.resultCents, warnings: at.warnings,
    };
    cashTimeline = projection.map((p) => ({ month: p.month, resultCents: p.resultCents }));
  }

  const sustainability = sustainabilityOfMonth({
    today: source.today, month, isCurrent: phase === 'current', allowEstimate: phase !== 'past',
    receivables: source.receivables.map((r) => ({ id: r.id, description: r.description, amountCents: r.amountCents, expectedDate: r.expectedDate, status: r.status })),
    fixedIncomes: source.fixedIncomes.map((i) => ({ ...i })),
    incomeOccurrences: source.incomeOccurrences.map((o) => ({ incomeId: o.incomeId, month: o.month, amountCents: o.amountCents, status: o.status })),
    commitments: source.commitments.map((c) => ({ ...c })),
    occurrences: source.occurrences.map((o) => ({ commitmentId: o.commitmentId, month: o.month, amountCents: o.amountCents, status: o.status })),
    invoices: invoiceInputs, cells: estimate.cells, warnings: cash?.warnings ?? [],
  });

  /* ---------------- parcelas */
  const invoiceById = new Map(source.invoices.map((i) => [i.id, i]));
  const installmentSource = source.items.flatMap((it) => {
    const inv = invoiceById.get(it.invoiceId);
    if (!inv || it.kind !== 'purchase') return [];
    return [{
      card: inv.card, invoiceMonth: inv.month, baseDescription: it.baseDescription, installmentNo: it.installmentNo,
      installmentTotal: it.installmentTotal, amountCents: it.amountCents, status: it.status,
    }];
  });
  const installmentsLaunched: InstallmentLine[] = installmentSource
    .filter((i) => i.invoiceMonth === month && i.status !== 'removed' && i.installmentNo !== null && i.installmentTotal !== null)
    .map((i) => ({ card: i.card, description: i.baseDescription, installmentNo: i.installmentNo as number, installmentTotal: i.installmentTotal as number, amountCents: i.amountCents }))
    .sort((a, b) => a.card.localeCompare(b.card) || a.description.localeCompare(b.description));
  const installmentsInferred: InstallmentLine[] = phase === 'past'
    ? []
    : projectFutureInstallments(installmentSource, month, month).map((p) => ({
      card: p.card, description: p.baseDescription, installmentNo: p.installmentNo, installmentTotal: p.installmentTotal, amountCents: p.amountCents,
    }));

  /* ---------------- meta conjunta */
  const resolved = resolveCardGoal(source.goals, month);
  const spentCents = sustainability.invoicesCents;
  const presentCards = cards.filter((c) => c.invoice !== null).length;
  const basis: MonthGoalView['basis'] = presentCards === 0 ? 'none' : cards.every((c) => c.completeness === 'complete') ? 'complete' : 'partial';
  const hypothesisCents = sustainability.averageResultCents !== null
    ? sustainability.invoicesCents + sustainability.cardFixedCents + sustainability.estimatedGapCents
    : null;
  const goal: MonthGoalView = {
    resolved, spentCents, basis,
    usagePercent: resolved ? Math.round((spentCents / resolved.amountCents) * 100) : null,
    remainingCents: resolved ? Math.max(0, resolved.amountCents - spentCents) : null,
    overCents: resolved ? Math.max(0, spentCents - resolved.amountCents) : 0,
    hypothesisCents,
    aboveSustainableLimit: Boolean(resolved && sustainability.hypothesisAllowed && !sustainability.noIncomeRegistered && resolved.amountCents > sustainability.limit.combinedCents),
  };

  const committedCents = sustainability.directCents + sustainability.invoicesCents + sustainability.cardFixedCents;
  const completeness: MonthView['completeness'] =
    phase === 'future' ? 'partial' : phase === 'current' ? 'in_progress' : basis === 'complete' ? 'closed' : 'incomplete';

  return {
    month, phase, completeness,
    incomeFixed, incomeOneOff, commitmentsDirect, commitmentsCard, cards,
    installmentsLaunched, installmentsInferred,
    sustainability, estimate, committedCents,
    committedPercentOfIncome: sustainability.incomeCents > 0 ? Math.round((committedCents / sustainability.incomeCents) * 100) : null,
    goal, cash, cashTimeline,
    staleInvoices: staleUnpaidInvoices(invoiceInputs, currentMonth),
  };
}

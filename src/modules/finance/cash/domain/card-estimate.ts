import { CARD_IDS, compareMonths, type CardId, type MonthKey } from './month';
import type { InvoiceInput, MonthProjection } from './projection';

/**
 * Estimativa de gastos futuros no cartão — função pura, média móvel de 3 meses.
 *
 * É uma HIPÓTESE ("se mantivermos a média"): fica SEMPRE separada dos valores
 * confirmados e nunca é gravada como fatura nem tratada como dívida. Regras:
 *  - Cada cartão (Lucas, Matheus) tem a sua média, só com as 3 faturas
 *    COMPLETAS e REAIS mais recentes: fatura FECHADA ou PAGA, com valor, de um
 *    mês de vencimento anterior ao atual. Fatura ABERTA nunca é mês completo (ainda
 *    recebe compras), mesmo que seja antiga e esteja esquecida como "aberta";
 *    fatura de mês futuro nunca é histórico.
 *  - A média avança sozinha quando chega um novo mês real.
 *  - Sem 3 faturas completas o cartão fica SEM estimativa e a interface diz
 *    quantas faltam: ausência de dados nunca vira "gasto zero" nem valor inventado.
 *  - Mês com fatura FECHADA ou PAGA é definitivo: a fatura real substitui a
 *    média (estimativa zero).
 *  - Mês com fatura ainda ABERTA (parcial) ou sem fatura: o esperado é o MAIOR
 *    entre o que já está lançado (fatura + gastos fixos no cartão ainda sem
 *    fatura) e a média; a estimativa é só a diferença — nunca "média + fatura
 *    inteira".
 *  - Cada mês é independente: a estimativa de um mês não é acumulada no outro.
 *  - Sem suavização: a média simples dos 3 meses, inclusive os altos.
 */

export const HISTORY_INVOICES = 3;
/** Mantido por compatibilidade com textos existentes. */
export const MIN_HISTORY_INVOICES = HISTORY_INVOICES;

export interface CardEstimateByCard {
  card: CardId;
  averageCents: number;
  /** Meses de vencimento das faturas usadas na média (mais recente primeiro). */
  basedOnMonths: MonthKey[];
  basedOnInvoices: number;
}

/**
 * Como o gasto esperado do cartão naquele mês foi composto:
 *  - real: fatura fechada/paga — o valor real vale e a média não entra;
 *  - partial: fatura aberta — o já lançado vale e só a diferença até a média é estimada;
 *  - average: ainda sem fatura — vale a média (menos gastos fixos já conhecidos);
 *  - unavailable: sem média confiável e sem fatura definitiva — nada é inventado.
 */
export type CardMonthKind = 'real' | 'partial' | 'average' | 'unavailable';

export interface CardEstimateCell {
  card: CardId;
  month: MonthKey;
  kind: CardMonthKind;
  /** Valor da fatura do mês (0 se não houver). */
  invoiceCents: number;
  /** Gastos fixos no cartão ainda sem fatura (já contados como conhecidos). */
  cardFixedCents: number;
  averageCents: number | null;
  /** Parte ESTIMADA (hipótese) para completar o mês. */
  gapCents: number;
}

export interface CardEstimateMonth {
  month: MonthKey;
  /** Estimativa adicional deste mês (não confirmada). Independente dos outros meses. */
  cents: number;
  /** Mantido por compatibilidade; a interface nova NÃO acumula hipóteses entre meses. */
  cumulativeCents: number;
}

export interface CardEstimate {
  /** Há média confiável em pelo menos um cartão. */
  enough: boolean;
  byCard: CardEstimateByCard[];
  /** Cartões sem 3 faturas completas (ficam fora da estimativa). */
  insufficientCards: CardId[];
  /** Quantas faturas completas cada cartão tem hoje (para dizer "faltam N"). */
  availableByCard: Record<CardId, number>;
  months: CardEstimateMonth[];
  /** Detalhe por cartão e mês (auditável). */
  cells: CardEstimateCell[];
}

/** Fatura que pode compor o histórico estatístico: fechada/paga, com valor, de mês de vencimento anterior ao atual. */
export function isCompleteHistoryInvoice(invoice: InvoiceInput, currentMonth: MonthKey): boolean {
  return (
    invoice.status !== 'open' &&
    compareMonths(invoice.month, currentMonth) < 0 &&
    invoice.amountCents !== null &&
    invoice.amountCents > 0
  );
}

export function estimateCardSpending(
  invoices: readonly InvoiceInput[],
  projection: readonly MonthProjection[],
  currentMonth: MonthKey
): CardEstimate {
  const byCard: CardEstimateByCard[] = [];
  const insufficientCards: CardId[] = [];
  const availableByCard = {} as Record<CardId, number>;

  for (const card of CARD_IDS) {
    const complete = invoices
      .filter((i) => i.card === card && isCompleteHistoryInvoice(i, currentMonth))
      .sort((a, b) => compareMonths(b.month, a.month));
    availableByCard[card] = Math.min(complete.length, HISTORY_INVOICES);
    if (complete.length < HISTORY_INVOICES) {
      insufficientCards.push(card);
      continue;
    }
    const last = complete.slice(0, HISTORY_INVOICES);
    const total = last.reduce((s, i) => s + (i.amountCents ?? 0), 0);
    byCard.push({
      card,
      averageCents: Math.round(total / last.length),
      basedOnMonths: last.map((i) => i.month),
      basedOnInvoices: last.length,
    });
  }

  const cells: CardEstimateCell[] = [];
  const months: CardEstimateMonth[] = [];
  let cumulative = 0;
  for (const m of projection) {
    let monthCents = 0;
    for (const card of CARD_IDS) {
      const entry = byCard.find((b) => b.card === card) ?? null;
      const invoice = invoices.find((i) => i.card === card && i.month === m.month) ?? null;
      const cardFixedCents = m.cardFixedLines.filter((l) => l.card === card).reduce((s, l) => s + l.countedCents, 0);
      const invoiceCents = invoice?.amountCents ?? 0;
      const base = { card, month: m.month, invoiceCents, cardFixedCents, averageCents: entry?.averageCents ?? null };

      if (invoice && invoice.status !== 'open') {
        cells.push({ ...base, kind: 'real', gapCents: 0 }); // fechada/paga: a fatura real vale
        continue;
      }
      if (!entry) {
        cells.push({ ...base, kind: 'unavailable', gapCents: 0 });
        continue;
      }
      const gapCents = Math.max(0, entry.averageCents - (invoiceCents + cardFixedCents));
      cells.push({ ...base, kind: invoice ? 'partial' : 'average', gapCents });
      monthCents += gapCents;
    }
    cumulative += monthCents;
    months.push({ month: m.month, cents: monthCents, cumulativeCents: cumulative });
  }

  return { enough: byCard.length > 0, byCard, insufficientCards, availableByCard, months, cells };
}

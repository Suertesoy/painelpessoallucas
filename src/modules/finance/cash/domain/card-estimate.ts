import { CARD_IDS, compareMonths, type CardId, type MonthKey } from './month';
import type { InvoiceInput, MonthProjection } from './projection';

/**
 * Estimativa OPCIONAL de gastos no cartão — função pura.
 *
 * Nunca entra nos totais confirmados da projeção: é calculada à parte e só
 * aparece quando o usuário pede. Regras para não duplicar valores:
 *  - só usa como histórico faturas de meses ANTERIORES ao atual, com valor;
 *  - exige um mínimo de faturas por cartão; sem isso, não inventa valor;
 *  - fatura fechada ou paga já é definitiva: estimativa zero para o mês;
 *  - o que a fatura (ou os fixos "no cartão" ainda sem fatura) já soma no
 *    mês é DESCONTADO da média — a estimativa cobre só a diferença.
 */

export const MIN_HISTORY_INVOICES = 3;
export const MAX_HISTORY_INVOICES = 6;

export interface CardEstimateByCard {
  card: CardId;
  averageCents: number;
  basedOnInvoices: number;
}

export interface CardEstimateMonth {
  month: MonthKey;
  /** Estimativa adicional deste mês (não confirmada). */
  cents: number;
  /** Estimativa acumulada até este mês, inclusive: é o que muda o resultado acumulado. */
  cumulativeCents: number;
}

export interface CardEstimate {
  /** Há histórico suficiente em pelo menos um cartão. */
  enough: boolean;
  byCard: CardEstimateByCard[];
  /** Cartões sem histórico suficiente (ficam fora da estimativa). */
  insufficientCards: CardId[];
  months: CardEstimateMonth[];
}

export function estimateCardSpending(
  invoices: readonly InvoiceInput[],
  projection: readonly MonthProjection[],
  currentMonth: MonthKey
): CardEstimate {
  const byCard: CardEstimateByCard[] = [];
  const insufficientCards: CardId[] = [];

  for (const card of CARD_IDS) {
    const history = invoices
      .filter((i) => i.card === card && compareMonths(i.month, currentMonth) < 0 && i.amountCents !== null && i.amountCents > 0)
      .sort((a, b) => compareMonths(b.month, a.month))
      .slice(0, MAX_HISTORY_INVOICES);
    if (history.length < MIN_HISTORY_INVOICES) {
      insufficientCards.push(card);
      continue;
    }
    const total = history.reduce((s, i) => s + (i.amountCents ?? 0), 0);
    byCard.push({ card, averageCents: Math.round(total / history.length), basedOnInvoices: history.length });
  }

  let cumulative = 0;
  const months: CardEstimateMonth[] = projection.map((m) => {
    let cents = 0;
    for (const entry of byCard) {
      const invoice = invoices.find((i) => i.card === entry.card && i.month === m.month);
      if (invoice && invoice.status !== 'open') continue; // fechada/paga: definitiva
      const known =
        (invoice?.amountCents ?? 0) +
        m.cardFixedLines.filter((l) => l.card === entry.card).reduce((s, l) => s + l.countedCents, 0);
      cents += Math.max(0, entry.averageCents - known);
    }
    cumulative += cents;
    return { month: m.month, cents, cumulativeCents: cumulative };
  });

  return { enough: byCard.length > 0, byCard, insufficientCards, months };
}

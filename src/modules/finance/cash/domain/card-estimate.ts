import { CARD_IDS, compareMonths, type CardId, type MonthKey } from './month';
import type { InvoiceInput, MonthProjection } from './projection';

/**
 * Estimativa de gastos futuros no cartão — função pura, média móvel de 3 meses.
 *
 * Fica SEMPRE separada dos valores confirmados da projeção e nunca é gravada
 * como fatura. Regras:
 *  - Cada cartão (Lucas, Matheus) tem a sua média, só com as 3 faturas
 *    COMPLETAS e REAIS mais recentes: mês de vencimento anterior ao atual,
 *    com valor lançado. Fatura paga (histórica) conta; fatura aberta do mês
 *    atual ou de meses futuros nunca entra na média.
 *  - A média avança sozinha quando chega um novo mês real.
 *  - Sem 3 faturas completas o cartão fica SEM estimativa e a interface diz
 *    quantas faltam: ausência de dados nunca vira "gasto zero" nem valor inventado.
 *  - Mês com fatura FECHADA ou PAGA é definitivo: a fatura real substitui a
 *    estimativa (estimativa zero).
 *  - Mês com fatura ainda ABERTA (ou sem fatura): o esperado é o MAIOR entre o
 *    que já está lançado (fatura + gastos fixos no cartão ainda sem fatura) e a
 *    média; a estimativa é só a diferença, então nunca soma por cima do que já
 *    foi contado.
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

export interface CardEstimateMonth {
  month: MonthKey;
  /** Estimativa adicional deste mês (não confirmada). */
  cents: number;
  /** Estimativa acumulada até este mês, inclusive: é o que muda o resultado acumulado. */
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
      .filter((i) => i.card === card && compareMonths(i.month, currentMonth) < 0 && i.amountCents !== null && i.amountCents > 0)
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

  let cumulative = 0;
  const months: CardEstimateMonth[] = projection.map((m) => {
    let cents = 0;
    for (const entry of byCard) {
      const invoice = invoices.find((i) => i.card === entry.card && i.month === m.month);
      if (invoice && invoice.status !== 'open') continue; // fechada/paga: a fatura real vale
      const known =
        (invoice?.amountCents ?? 0) +
        m.cardFixedLines.filter((l) => l.card === entry.card).reduce((s, l) => s + l.countedCents, 0);
      cents += Math.max(0, entry.averageCents - known);
    }
    cumulative += cents;
    return { month: m.month, cents, cumulativeCents: cumulative };
  });

  return { enough: byCard.length > 0, byCard, insufficientCards, availableByCard, months };
}

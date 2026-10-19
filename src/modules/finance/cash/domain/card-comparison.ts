import { CARD_IDS, addMonths, compareMonths, monthOf, monthsBetween, type CardId, type MonthKey } from './month';
import { resolveCardGoal, type CardGoal } from './card-goals';
import { effectiveInvoiceAmount, type CardInvoice } from './types';

/**
 * Comparativo histórico: meta mensal conjunta × gasto efetivo lançado nos cartões.
 *
 * "Gasto efetivo" é só o que está nas faturas (valor real, nunca estimativa).
 * Compras parceladas importadas já estão DENTRO dos valores das faturas e não
 * são somadas de novo. Cada mês diz o quão completo é:
 *  - closed: as faturas dos dois cartões estão fechadas ou pagas;
 *  - open: há fatura ainda aberta (valor parcial);
 *  - missing: algum cartão ainda não tem fatura lançada;
 *  - future: mês que ainda não terminou/começou (mês atual ou posterior).
 */

export type ComparisonStatus = 'closed' | 'open' | 'missing' | 'future';

export interface ComparisonRow {
  month: MonthKey;
  goalCents: number | null;
  goalSource: 'month' | 'default' | null;
  spentCents: number;
  /** Fechado só quando todos os cartões têm fatura fechada/paga e o mês já terminou. */
  status: ComparisonStatus;
  /** Gasto lançado acima da meta (só com meta definida). */
  overGoal: boolean;
  /** Diferença para a meta: positivo = sobrou, negativo = passou. null sem meta. */
  differenceCents: number | null;
  byCard: { card: CardId; cents: number; status: CardInvoice['status'] | null }[];
}

export interface ComparisonResult {
  rows: ComparisonRow[];
  monthsWithoutGoal: MonthKey[];
  maxCents: number;
}

export const DEFAULT_COMPARISON_MONTHS = 12;

export function buildCardComparison(input: {
  today: string;
  invoices: readonly CardInvoice[];
  goals: readonly CardGoal[];
  /** Quantos meses mostrar, terminando no mês mais recente com dado (ou no atual). */
  months?: number;
}): ComparisonResult {
  const current = monthOf(input.today);
  const count = input.months ?? DEFAULT_COMPARISON_MONTHS;

  const withData = [
    ...input.invoices.map((i) => i.month),
    ...input.goals.filter((g) => g.scope === 'month').map((g) => g.month),
  ];
  const lastData = withData.reduce<MonthKey>((m, x) => (compareMonths(x, m) > 0 ? x : m), current);
  const last = compareMonths(lastData, addMonths(current, 3)) > 0 ? addMonths(current, 3) : lastData;

  const rows: ComparisonRow[] = [];
  for (let k = count - 1; k >= 0; k -= 1) {
    const month = addMonths(last, -k);
    const byCard = CARD_IDS.map((card) => {
      const invoice = input.invoices.find((i) => i.card === card && i.month === month) ?? null;
      return { card, cents: invoice ? (effectiveInvoiceAmount(invoice) ?? 0) : 0, status: invoice?.status ?? null };
    });
    const spentCents = byCard.reduce((s, c) => s + c.cents, 0);
    const complete = byCard.every((c) => c.status === 'closed' || c.status === 'paid');
    const status: ComparisonStatus =
      monthsBetween(current, month) >= 0 ? 'future' : complete ? 'closed' : byCard.some((c) => c.status === null) ? 'missing' : 'open';
    const resolved = resolveCardGoal(input.goals, month);
    rows.push({
      month,
      goalCents: resolved?.amountCents ?? null,
      goalSource: resolved?.source ?? null,
      spentCents,
      status,
      overGoal: resolved !== null && spentCents > resolved.amountCents,
      differenceCents: resolved ? resolved.amountCents - spentCents : null,
      byCard,
    });
  }

  return {
    rows,
    monthsWithoutGoal: rows.filter((r) => r.goalCents === null).map((r) => r.month),
    maxCents: rows.reduce((m, r) => Math.max(m, r.spentCents, r.goalCents ?? 0), 0),
  };
}

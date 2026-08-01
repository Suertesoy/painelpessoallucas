import { absCents, centsToBRL, expenseContributionCents, roundPercentage, sumCents } from './money';
import type { FinanceNature } from './finance-transaction.schema';

/**
 * Cálculos financeiros centralizados — nenhum componente de UI reimplementa
 * esta aritmética (seção "Cálculos e transparência" do pedido). Só
 * transações CONFIRMADAS entram aqui; o chamador é responsável por filtrar
 * antes de passar para estas funções.
 */

export interface AnalyticsTransaction {
  categoryId: string;
  nature: FinanceNature;
  amountCents: number;
}

export interface MonthlyIncomeInput {
  matheusIncomeCents: number;
  lucasIncomeCents: number;
  otherIncomeCents: number;
}

export interface CashPositionInput {
  availableCashCents: number;
  savedCashCents: number;
}

export function totalIncomeCents(income: MonthlyIncomeInput): number {
  return income.matheusIncomeCents + income.lucasIncomeCents + income.otherIncomeCents;
}

export function totalExpenseCents(transactions: readonly AnalyticsTransaction[]): number {
  return sumCents(transactions.map((t) => expenseContributionCents(t.nature, t.amountCents)));
}

export function monthResultCents(income: MonthlyIncomeInput, transactions: readonly AnalyticsTransaction[]): number {
  return totalIncomeCents(income) - totalExpenseCents(transactions);
}

export function totalFinancialPositionCents(position: CashPositionInput): number {
  return position.availableCashCents + position.savedCashCents;
}

export interface CategoryBreakdownEntry {
  categoryId: string;
  categoryName: string;
  totalCents: number;
  percentage: number;
}

export function computeCategoryBreakdown(
  transactions: readonly AnalyticsTransaction[],
  categoryNames: ReadonlyMap<string, string>
): CategoryBreakdownEntry[] {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    const contribution = expenseContributionCents(transaction.nature, transaction.amountCents);
    if (contribution === 0) continue;
    totals.set(transaction.categoryId, (totals.get(transaction.categoryId) ?? 0) + contribution);
  }
  const grandTotal = sumCents(Array.from(totals.values()));
  const entries: CategoryBreakdownEntry[] = Array.from(totals.entries()).map(([categoryId, totalCentsValue]) => ({
    categoryId,
    categoryName: categoryNames.get(categoryId) ?? 'Categoria removida',
    totalCents: totalCentsValue,
    percentage: roundPercentage(totalCentsValue, grandTotal),
  }));
  return entries.sort((a, b) => b.totalCents - a.totalCents);
}

/** Texto determinístico: "Mercado representou 23% dos gastos confirmados deste mês." */
export function buildCategoryShareText(entry: CategoryBreakdownEntry): string {
  return `${entry.categoryName} representou ${entry.percentage}% dos gastos confirmados deste mês.`;
}

export interface MonthComparisonResult {
  currentExpenseCents: number;
  previousExpenseCents: number | null;
  deltaCents: number | null;
  text: string;
}

export function compareWithPreviousMonth(
  currentExpenseCents: number,
  previousExpenseCents: number | null
): MonthComparisonResult {
  if (previousExpenseCents === null) {
    return {
      currentExpenseCents,
      previousExpenseCents: null,
      deltaCents: null,
      text: 'Não há dados suficientes do mês anterior para comparação.',
    };
  }
  const deltaCents = currentExpenseCents - previousExpenseCents;
  if (deltaCents === 0) {
    return {
      currentExpenseCents,
      previousExpenseCents,
      deltaCents,
      text: 'Os gastos confirmados ficaram iguais aos do mês anterior.',
    };
  }
  const direction = deltaCents > 0 ? 'aumentaram' : 'diminuíram';
  return {
    currentExpenseCents,
    previousExpenseCents,
    deltaCents,
    text: `Os gastos confirmados ${direction} ${centsToBRL(absCents(deltaCents))} em comparação com o mês anterior.`,
  };
}

export interface MonthlyEvolutionPoint {
  month: string; // YYYY-MM-01
  totalExpenseCents: number;
}

/** Texto de resumo do mês: renda informada vs. gastos confirmados. */
export function buildMonthSummaryText(income: MonthlyIncomeInput, expenseCents: number): string {
  return `Neste mês, a renda informada foi ${centsToBRL(totalIncomeCents(income))} e os gastos confirmados foram ${centsToBRL(expenseCents)}.`;
}

/** Texto da situação atual: disponível + guardado. */
export function buildCashPositionText(position: CashPositionInput): string {
  return `Com base nos valores informados, existem ${centsToBRL(position.availableCashCents)} disponíveis e ${centsToBRL(position.savedCashCents)} guardados.`;
}

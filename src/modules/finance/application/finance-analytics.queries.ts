import type { FinanceRepository } from './finance.repository';
import { shiftMonthKey } from '../domain/finance-monthly-record.schema';
import {
  totalIncomeCents,
  totalExpenseCents,
  monthResultCents,
  totalFinancialPositionCents,
  computeCategoryBreakdown,
  compareWithPreviousMonth,
  buildMonthSummaryText,
  buildCashPositionText,
  type CategoryBreakdownEntry,
  type MonthComparisonResult,
  type MonthlyEvolutionPoint,
} from '../domain/analytics';

export interface MonthOverview {
  month: string;
  matheusIncomeCents: number;
  lucasIncomeCents: number;
  otherIncomeCents: number;
  totalIncomeCents: number;
  expenseCents: number;
  resultCents: number;
  availableCashCents: number;
  savedCashCents: number;
  totalFinancialPositionCents: number;
  categoryBreakdown: CategoryBreakdownEntry[];
  comparisonWithPreviousMonth: MonthComparisonResult;
  hasMonthlyRecord: boolean;
  hasTransactions: boolean;
  summaryText: string;
  cashPositionText: string;
}

/**
 * Análises calculadas localmente a partir de dados já persistidos (renda
 * manual + transações confirmadas). Toda a aritmética vem de
 * `domain/analytics.ts` — esta classe só compõe repositório -> domínio.
 */
export class FinanceAnalyticsQueries {
  constructor(private repo: FinanceRepository) {}

  async getMonthOverview(month: string): Promise<MonthOverview> {
    const [monthlyRecord, categories, transactions] = await Promise.all([
      this.repo.getMonthlyRecord(month),
      this.repo.listCategories(),
      this.repo.listTransactions({ month }),
    ]);

    const income = {
      matheusIncomeCents: monthlyRecord?.matheusIncomeCents ?? 0,
      lucasIncomeCents: monthlyRecord?.lucasIncomeCents ?? 0,
      otherIncomeCents: monthlyRecord?.otherIncomeCents ?? 0,
    };
    const analyticsTransactions = transactions.map((t) => ({
      categoryId: t.categoryId,
      nature: t.nature,
      amountCents: t.amountCents,
    }));
    const expenseCents = totalExpenseCents(analyticsTransactions);
    const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
    const categoryBreakdown = computeCategoryBreakdown(analyticsTransactions, categoryNames);

    const previousMonth = shiftMonthKey(month, -1);
    const previousTransactions = await this.repo.listTransactions({ month: previousMonth });
    const previousExpenseCents =
      previousTransactions.length > 0
        ? totalExpenseCents(
            previousTransactions.map((t) => ({ categoryId: t.categoryId, nature: t.nature, amountCents: t.amountCents }))
          )
        : null;
    const comparisonWithPreviousMonth = compareWithPreviousMonth(expenseCents, previousExpenseCents);

    const availableCashCents = monthlyRecord?.availableCashCents ?? 0;
    const savedCashCents = monthlyRecord?.savedCashCents ?? 0;

    return {
      month,
      matheusIncomeCents: income.matheusIncomeCents,
      lucasIncomeCents: income.lucasIncomeCents,
      otherIncomeCents: income.otherIncomeCents,
      totalIncomeCents: totalIncomeCents(income),
      expenseCents,
      resultCents: monthResultCents(income, analyticsTransactions),
      availableCashCents,
      savedCashCents,
      totalFinancialPositionCents: totalFinancialPositionCents({ availableCashCents, savedCashCents }),
      categoryBreakdown,
      comparisonWithPreviousMonth,
      hasMonthlyRecord: monthlyRecord !== null,
      hasTransactions: transactions.length > 0,
      summaryText: buildMonthSummaryText(income, expenseCents),
      cashPositionText: buildCashPositionText({ availableCashCents, savedCashCents }),
    };
  }

  /** Série de evolução mensal dos gastos confirmados, meses com dado mais recente por último. */
  async getExpenseEvolution(monthsCount = 6): Promise<MonthlyEvolutionPoint[]> {
    const transactions = await this.repo.listTransactions();
    const totalsByMonth = new Map<string, number>();
    for (const transaction of transactions) {
      const monthKey = `${transaction.transactionDate.slice(0, 7)}-01`;
      const contribution = totalExpenseCents([
        { categoryId: transaction.categoryId, nature: transaction.nature, amountCents: transaction.amountCents },
      ]);
      totalsByMonth.set(monthKey, (totalsByMonth.get(monthKey) ?? 0) + contribution);
    }
    const points: MonthlyEvolutionPoint[] = Array.from(totalsByMonth.entries())
      .map(([month, totalExpenseCentsValue]) => ({ month, totalExpenseCents: totalExpenseCentsValue }))
      .sort((a, b) => a.month.localeCompare(b.month));
    return points.slice(-monthsCount);
  }
}

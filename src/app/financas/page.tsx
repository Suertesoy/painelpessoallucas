'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Wallet, Upload } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import { todayDateStr } from '@/lib/dates';
import { monthKeyFromYearMonth, shiftMonthKey } from '@/modules/finance/domain/finance-monthly-record.schema';
import { FALLBACK_FINANCE_CATEGORY_SLUG } from '@/modules/finance/domain/finance-category.schema';
import { FinanceMonthSummaryCards, FinanceCashPositionCards } from '@/components/finance/finance-summary-cards';
import { FinanceCategoryChart } from '@/components/finance/finance-category-chart';
import { FinanceEvolutionChart } from '@/components/finance/finance-evolution-chart';
import { FinanceMonthlyForm } from '@/components/finance/finance-monthly-form';
import { FinanceTransactionsList } from '@/components/finance/finance-transactions-list';
import { FinanceImportHistory } from '@/components/finance/finance-import-history';

/** Heurística segura: nunca exibe o erro cru, só decide qual aviso mostrar. */
function looksLikeMissingMigration(message: string): boolean {
  return /does not exist|schema cache|42P01/i.test(message);
}

export default function FinancasPage() {
  const { finance: financeCommands } = useCommands();
  const { finance: financeQueries } = useQueries();

  const [yearMonth, setYearMonth] = useState(() => todayDateStr().slice(0, 7));
  const monthKey = useMemo(() => monthKeyFromYearMonth(yearMonth), [yearMonth]);
  const previousMonthKey = useMemo(() => shiftMonthKey(monthKey, -1), [monthKey]);

  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
    isOffline,
    refetch: refetchOverview,
  } = useReactiveQuery(() => financeQueries.analytics.getMonthOverview(monthKey), [monthKey]);

  const { data: evolution } = useReactiveQuery(() => financeQueries.analytics.getExpenseEvolution(6), []);
  const { data: categories } = useReactiveQuery(() => financeQueries.queries.listCategories(), []);
  const { data: sources } = useReactiveQuery(() => financeQueries.queries.listSources(), []);
  const { data: imports } = useReactiveQuery(() => financeQueries.queries.listImports(), []);
  const { data: transactions } = useReactiveQuery(
    () => financeQueries.queries.listTransactions({ month: monthKey }),
    [monthKey]
  );
  const { data: settings } = useReactiveQuery(() => financeQueries.queries.getSettings(), []);

  const [initFailed, setInitFailed] = useState(false);
  const [initMigrationMissing, setInitMigrationMissing] = useState(false);
  const isInitializingRef = useRef(false);
  const runInit = useCallback(async () => {
    if (isInitializingRef.current) return;
    isInitializingRef.current = true;
    setInitFailed(false);
    setInitMigrationMissing(false);
    try {
      await financeCommands.setup.ensureDefaults();
      refetchOverview();
    } catch (e) {
      console.error('Erro ao preparar o módulo Finanças', e);
      const message = e instanceof Error ? e.message : '';
      setInitMigrationMissing(looksLikeMissingMigration(message));
      setInitFailed(true);
    } finally {
      isInitializingRef.current = false;
    }
  }, [financeCommands, refetchOverview]);

  useEffect(() => {
    const timer = setTimeout(() => void runInit(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasError = Boolean(overviewError) || initFailed;
  // Derivado durante a renderização (não em efeito) — evita a cascata de
  // setState-em-efeito; nunca exibe o erro cru, só decide qual aviso mostrar.
  const migrationMissing = initMigrationMissing || (overviewError ? looksLikeMissingMigration(overviewError) : false);

  const { data: previousOverview } = useReactiveQuery(
    () => financeQueries.analytics.getMonthOverview(previousMonthKey),
    [previousMonthKey]
  );

  const unclassifiedTransactions = useMemo(
    () =>
      (transactions ?? []).filter((t) => {
        const category = (categories ?? []).find((c) => c.id === t.categoryId);
        return category?.slug === FALLBACK_FINANCE_CATEGORY_SLUG;
      }),
    [transactions, categories]
  );

  const handleSubmitMonthly = useCallback(
    async (values: {
      matheusIncomeCents: number;
      lucasIncomeCents: number;
      otherIncomeCents: number;
      availableCashCents: number;
      savedCashCents: number;
    }) => {
      await financeCommands.monthly.upsertMonthlyRecord({ month: monthKey, ...values });
    },
    [financeCommands, monthKey]
  );

  const handleUpdateDefaultMatheus = useCallback(
    async (cents: number) => {
      await financeCommands.setup.updateDefaultMatheusIncome(cents);
    },
    [financeCommands]
  );

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Wallet size={24} className="text-blue-600" /> Finanças
        </h1>
        <Link
          href="/financas/importar"
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Upload size={16} /> Importar extrato/fatura
        </Link>
      </div>

      <p className="mt-2 text-xs text-gray-500">
        Visão consolidada da casa: os gastos não são divididos entre Lucas e Matheus, apenas por categoria.
      </p>

      <div className="mt-4">
        <label className="text-xs font-medium text-gray-600" htmlFor="finance-month">
          Mês
        </label>
        <input
          id="finance-month"
          type="month"
          value={yearMonth}
          onChange={(e) => setYearMonth(e.target.value)}
          className="mt-1 block rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>

      {hasError && (
        <div className="mt-4">
          {migrationMissing ? (
            <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-medium">O módulo Finanças ainda não está disponível.</p>
              <p className="mt-1 text-xs opacity-90">
                A migration do banco de dados deste módulo ainda não foi aplicada. As demais páginas do painel continuam
                funcionando normalmente — fale com quem administra o painel para aplicar a migration pendente.
              </p>
              <button
                type="button"
                onClick={() => void runInit()}
                className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-amber-50"
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <DataErrorNotice isOffline={isOffline} onRetry={() => void runInit()} />
          )}
        </div>
      )}

      {!hasError && overviewLoading && !overview && <p className="mt-6 text-sm text-gray-500">Carregando suas finanças…</p>}

      {!hasError && overview && (
        <div className="mt-6 space-y-6">
          <FinanceMonthSummaryCards overview={overview} />
          <FinanceCashPositionCards overview={overview} />

          <section aria-label="Comparação com o mês anterior">
            <h2 className="text-sm font-semibold text-gray-800">Comparação com o mês anterior</h2>
            <p className="mt-1 text-sm text-gray-600">{overview.comparisonWithPreviousMonth.text}</p>
            {!overview.hasTransactions && (
              <p className="mt-1 text-xs text-gray-400">
                Nenhuma transação confirmada neste mês ainda — a comparação acima pode não refletir todos os gastos reais.
              </p>
            )}
            {previousOverview && !previousOverview.hasTransactions && (
              <p className="mt-1 text-xs text-gray-400">
                O mês anterior também não tem transações confirmadas suficientes.
              </p>
            )}
          </section>

          <section aria-label="Gastos por categoria">
            <h2 className="text-sm font-semibold text-gray-800">Gastos por categoria</h2>
            <FinanceCategoryChart breakdown={overview.categoryBreakdown} />
          </section>

          <section aria-label="Evolução mensal">
            <h2 className="text-sm font-semibold text-gray-800">Evolução dos gastos ao longo dos meses</h2>
            <FinanceEvolutionChart points={evolution ?? []} />
          </section>

          <FinanceMonthlyForm
            overview={overview}
            defaultMatheusIncomeCents={settings?.defaultMatheusIncomeCents ?? 0}
            onSubmit={handleSubmitMonthly}
            onUpdateDefaultMatheusIncome={handleUpdateDefaultMatheus}
          />

          {unclassifiedTransactions.length > 0 && (
            <section aria-label="Lançamentos não classificados" className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h2 className="text-sm font-semibold text-amber-900">
                {unclassifiedTransactions.length} lançamento(s) não classificado(s) neste mês
              </h2>
              <p className="mt-1 text-xs text-amber-800">
                Ajuste a categoria diretamente na revisão da importação correspondente, ou confira a lista abaixo.
              </p>
            </section>
          )}

          <FinanceTransactionsList transactions={transactions ?? []} categories={categories ?? []} sources={sources ?? []} />

          <section aria-label="Histórico de importações">
            <h2 className="text-sm font-semibold text-gray-800">Importações</h2>
            <FinanceImportHistory imports={imports ?? []} sources={sources ?? []} />
          </section>
        </div>
      )}
    </div>
  );
}

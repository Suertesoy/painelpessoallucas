'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Eye, EyeOff, PieChart, Tags, Upload, Wallet } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useQueries } from '@/providers/repository.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import { todayDateStr } from '@/lib/dates';
import { useHideValuesPreference } from '@/lib/use-hide-values';
import { monthOf, type MonthKey } from '@/modules/finance/cash/domain/month';
import { buildMonthView, clampMonth } from '@/modules/finance/cash/domain/month-view';
import { AvailableBalanceCard, ReserveCard } from '@/components/finance-cash/balance-cards';
import { ReceivablesSection } from '@/components/finance-cash/receivables-section';
import { CommitmentsSection } from '@/components/finance-cash/commitments-section';
import { CardsSection } from '@/components/finance-cash/cards-section';
import { Card, HideValuesContext, buttonSecondary } from '@/components/finance-cash/ui';
import { MonthSummaryCard, SustainabilityCard } from '@/components/finance-cash/month-summary';
import { MonthNavigator } from '@/components/finance-cash/month-parts';
import { CardGoalCard } from '@/components/finance-cash/goal-card';
import { RegisterMovementButton } from '@/components/finance-cash/register-movement';

/** Heurística segura: nunca exibe o erro cru, só decide qual aviso mostrar. */
function looksLikeMissingMigration(message: string): boolean {
  return /does not exist|schema cache|42P01|PGRST205/i.test(message);
}

/**
 * Finanças = UM mês por vez, com setas. Abre no mês atual (data local); todas as
 * seções leem a mesma visão do mês escolhido (`buildMonthView`), então nenhuma
 * fica presa ao mês atual:
 *  1. Mês e setas;
 *  2. Resumo: resultado do mês inteiro × caixa restante;
 *  3. Saldo e reserva (de hoje, recolhido) e Registrar movimentação;
 *  4. Meta conjunta dos cartões e progresso;
 *  5. Compromissos e situação dos pagamentos;
 *  6. Entradas previstas e recebidas;
 *  7. Faturas e parcelas do mês;
 *  8. Sustentabilidade e limite combinado (detalhes expandíveis);
 *  9. Análises e comparativo entre meses.
 * O olho oculta os valores só na tela (preferência deste aparelho).
 */
export default function FinancasPage() {
  const { financeCash } = useQueries();
  const today = useMemo(() => todayDateStr(), []);
  const currentMonth = monthOf(today);
  const [selected, setSelected] = useState<MonthKey>(currentMonth);
  const [hidden, toggleHidden] = useHideValuesPreference();
  const { data, isLoading, error, isOffline, refetch } = useReactiveQuery(() => financeCash.getSnapshot(today), [today]);

  const month = clampMonth(selected, currentMonth);
  const view = useMemo(() => (data ? buildMonthView(data, month) : null), [data, month]);
  const missingByInvoice = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of data?.items ?? []) if (item.status === 'missing') counts[item.invoiceId] = (counts[item.invoiceId] ?? 0) + 1;
    return counts;
  }, [data?.items]);

  return (
    <HideValuesContext.Provider value={hidden}>
      <div className="mx-auto max-w-3xl space-y-4 p-4 pb-24 md:p-8">
        <header className="flex items-end justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Wallet size={24} className="text-[var(--accent)]" /> Finanças
          </h1>
          <button
            type="button"
            onClick={toggleHidden}
            aria-pressed={hidden}
            aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'}
            title={hidden ? 'Mostrar valores' : 'Ocultar valores'}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--foreground)]"
          >
            {hidden ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </header>

        <MonthNavigator month={month} currentMonth={currentMonth} onChange={setSelected} />

        {error && (
          looksLikeMissingMigration(error) ? (
            <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-medium">O módulo Finanças ainda não está disponível.</p>
              <p className="mt-1 text-xs opacity-90">
                A atualização do banco de dados deste módulo ainda não foi aplicada. As demais páginas continuam funcionando.
              </p>
            </div>
          ) : (
            <DataErrorNotice isOffline={isOffline} onRetry={refetch} />
          )
        )}

        {!error && isLoading && !data && <p className="text-sm text-[var(--text-muted)]">Carregando suas finanças…</p>}

        {!error && data && view && (
          <>
            {/* 2. Resumo do mês escolhido */}
            <MonthSummaryCard view={view} balance={data.balance} />

            {/* 3. Saldo e reserva (de hoje) + Registrar movimentação */}
            <details className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
              <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-medium text-[var(--text-muted)]">
                Saldo e reserva de hoje
              </summary>
              <div className="space-y-3 border-t border-[var(--line)] p-3">
                <AvailableBalanceCard balance={data.balance} />
                <ReserveCard balance={data.balance} />
              </div>
            </details>
            <div aria-label="Registrar movimentação">
              <RegisterMovementButton
                categories={data.categories}
                persistedCategories={data.categoriesPersisted}
                expenses={data.expenses}
                rules={data.categoryRules}
                currentMonth={view.month}
              />
            </div>

            {/* 4. Meta conjunta dos cartões */}
            <CardGoalCard view={view} goals={data.goals} goalsAvailable={data.goalsAvailable} />

            {/* 5. Compromissos e situação dos pagamentos */}
            <CommitmentsSection commitments={data.commitments} view={view} showAdd={false} />

            {/* 6. Entradas previstas e recebidas */}
            <ReceivablesSection
              receivables={data.receivables}
              view={view}
              fixedIncomes={data.fixedIncomes}
              incomeOccurrences={data.incomeOccurrences}
              balanceUpdatedAt={data.balance.availableUpdatedAt}
              showAdd={false}
            />

            {/* 7. Faturas e parcelas do mês */}
            <CardsSection invoices={data.invoices} view={view} currentMonth={currentMonth} missingByInvoice={missingByInvoice} onSelectMonth={setSelected} />

            {/* 8. Sustentabilidade e limite combinado */}
            <SustainabilityCard view={view} />

            {/* 9. Análises e comparativo */}
            <Card aria-label="Análises de gastos">
              <h2 className="text-base font-semibold">Análises de gastos</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Por categoria, loja e lançamento — e a meta mês a mês.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/financas/comparativo" className={buttonSecondary}><BarChart3 size={16} /> Comparar meses</Link>
                <Link href="/financas/gastos" className={buttonSecondary}><PieChart size={16} /> Ver gastos</Link>
                <Link href="/financas/categorias" className={buttonSecondary}><Tags size={16} /> Categorias</Link>
                <Link href="/financas/fatura/importar" className={buttonSecondary}><Upload size={16} /> Importar fatura</Link>
              </div>
            </Card>
          </>
        )}
      </div>
    </HideValuesContext.Provider>
  );
}

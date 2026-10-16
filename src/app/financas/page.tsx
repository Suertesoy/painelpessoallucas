'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, PieChart, Tags, Upload, Wallet } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useQueries } from '@/providers/repository.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import { todayDateStr } from '@/lib/dates';
import { useHideValuesPreference } from '@/lib/use-hide-values';
import { monthLabel, monthOf } from '@/modules/finance/cash/domain/month';
import { AvailableBalanceCard, ReserveCard } from '@/components/finance-cash/balance-cards';
import { ReceivablesSection } from '@/components/finance-cash/receivables-section';
import { CommitmentsSection } from '@/components/finance-cash/commitments-section';
import { CardsSection } from '@/components/finance-cash/cards-section';
import { Card, HideValuesContext, buttonSecondary } from '@/components/finance-cash/ui';
import { CurrentMonthCard, UpcomingMonths } from '@/components/finance-cash/month-summary';
import { RegisterMovementButton } from '@/components/finance-cash/register-movement';

/** Heurística segura: nunca exibe o erro cru, só decide qual aviso mostrar. */
function looksLikeMissingMigration(message: string): boolean {
  return /does not exist|schema cache|42P01|PGRST205/i.test(message);
}

/**
 * Finanças, na ordem de uso:
 *  1. Reserva protegida (discreta, recolhida) e saldo disponível;
 *  2. Registrar movimentação (um único ponto de entrada);
 *  3. Entradas do mês (previstas × recebidas × pontuais);
 *  4. Resumo e projeção do mês;
 *  5. Faturas;
 *  6. Análises de gastos.
 * O olho oculta os valores só na tela (preferência deste aparelho).
 */
export default function FinancasPage() {
  const { financeCash } = useQueries();
  const today = useMemo(() => todayDateStr(), []);
  const [hidden, toggleHidden] = useHideValuesPreference();
  const { data, isLoading, error, isOffline, refetch } = useReactiveQuery(() => financeCash.getSnapshot(today), [today]);

  const current = data?.projection[0];
  const missingByInvoice = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of data?.items ?? []) if (item.status === 'missing') counts[item.invoiceId] = (counts[item.invoiceId] ?? 0) + 1;
    return counts;
  }, [data?.items]);

  return (
    <HideValuesContext.Provider value={hidden}>
      <div className="mx-auto max-w-3xl space-y-4 p-4 pb-24 md:p-8">
        <header className="flex items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Wallet size={24} className="text-[var(--accent)]" /> Finanças
            </h1>
            <p className="mt-1 text-sm capitalize text-[var(--text-muted)]">{monthLabel(monthOf(today))}</p>
          </div>
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

        {!error && data && current && (
          <>
            {/* 1. Reserva (discreta) e saldo disponível */}
            <details className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
              <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-medium text-[var(--text-muted)]">
                Reserva protegida
              </summary>
              <div className="border-t border-[var(--line)] p-3">
                <ReserveCard balance={data.balance} />
              </div>
            </details>
            <AvailableBalanceCard balance={data.balance} />

            {/* 2. Registrar movimentação */}
            <Card aria-label="Registrar movimentação">
              <h2 className="text-base font-semibold">Para onde vai nosso dinheiro?</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Entradas, saídas e contas, tudo por aqui. Cada opção diz se mexe ou não no saldo.
              </p>
              <div className="mt-3">
                <RegisterMovementButton
                  categories={data.categories}
                  persistedCategories={data.categoriesPersisted}
                  expenses={data.expenses}
                  rules={data.categoryRules}
                  currentMonth={current.month}
                />
              </div>
            </Card>

            {/* 3. Entradas do mês */}
            <ReceivablesSection
              receivables={data.receivables}
              month={current}
              fixedIncomes={data.fixedIncomes}
              incomeOccurrences={data.incomeOccurrences}
              balanceUpdatedAt={data.balance.availableUpdatedAt}
              showAdd={false}
            />

            {/* 4. Resumo e projeção */}
            <CurrentMonthCard month={current} balanceInformed={data.balance.availableUpdatedAt !== null} estimate={data.cardEstimate} />
            <CommitmentsSection commitments={data.commitments} month={current} showAdd={false} />
            <UpcomingMonths months={data.projection} estimate={data.cardEstimate} />

            {/* 5. Faturas */}
            <CardsSection invoices={data.invoices} currentMonth={current.month} missingByInvoice={missingByInvoice} />

            {/* 6. Análises de gastos */}
            <Card aria-label="Análises de gastos">
              <h2 className="text-base font-semibold">Análises de gastos</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Por categoria, loja e lançamento.</p>
              <div className="mt-3 flex flex-wrap gap-2">
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

'use client';

import { useMemo } from 'react';
import { Wallet } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useQueries } from '@/providers/repository.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import { todayDateStr } from '@/lib/dates';
import { monthLabel, monthOf } from '@/modules/finance/cash/domain/month';
import { AvailableBalanceCard, ReserveCard } from '@/components/finance-cash/balance-cards';
import { ReceivablesSection } from '@/components/finance-cash/receivables-section';
import { CommitmentsSection } from '@/components/finance-cash/commitments-section';
import { CardsSection } from '@/components/finance-cash/cards-section';
import Link from 'next/link';
import { Card, Eyebrow, buttonPrimary, buttonSecondary } from '@/components/finance-cash/ui';
import { CoverageCard, ProjectionSection } from '@/components/finance-cash/projection-section';

/** Heurística segura: nunca exibe o erro cru, só decide qual aviso mostrar. */
function looksLikeMissingMigration(message: string): boolean {
  return /does not exist|schema cache|42P01|PGRST205/i.test(message);
}

export default function FinancasPage() {
  const { financeCash } = useQueries();
  const today = useMemo(() => todayDateStr(), []);
  const { data, isLoading, error, isOffline, refetch } = useReactiveQuery(() => financeCash.getSnapshot(today), [today]);

  const current = data?.projection[0];
  const missingByInvoice = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of data?.items ?? []) if (item.status === 'missing') counts[item.invoiceId] = (counts[item.invoiceId] ?? 0) + 1;
    return counts;
  }, [data?.items]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-24 md:p-8">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Wallet size={24} className="text-[var(--accent)]" /> Finanças
          </h1>
          <p className="mt-1 text-sm capitalize text-[var(--text-muted)]">{monthLabel(monthOf(today))}</p>
        </div>
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
          <div className="grid gap-4 md:grid-cols-2">
            <AvailableBalanceCard balance={data.balance} />
            <ReserveCard balance={data.balance} />
          </div>
          <ReceivablesSection receivables={data.receivables} month={current} fixedIncomes={data.fixedIncomes} incomeOccurrences={data.incomeOccurrences} balanceUpdatedAt={data.balance.availableUpdatedAt} />
          <CoverageCard month={current} balanceInformed={data.balance.availableUpdatedAt !== null} />
          <CommitmentsSection commitments={data.commitments} month={current} />
          <CardsSection invoices={data.invoices} currentMonth={current.month} missingByInvoice={missingByInvoice} />
          <Card aria-label="Gastos por categoria">
            <Eyebrow>Gastos nas faturas</Eyebrow>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Veja por categoria e finalidade, e descubra quanto vai em tecnologia e serviços profissionais.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/financas/gastos?preset=tech" className={buttonPrimary}>Tecnologia e profissional</Link>
              <Link href="/financas/gastos" className={buttonSecondary}>Todos os gastos</Link>
            </div>
          </Card>
          <ProjectionSection months={data.projection} installments={data.projectedInstallments} />
        </>
      )}
    </div>
  );
}

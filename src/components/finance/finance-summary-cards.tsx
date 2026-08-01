'use client';

import { centsToBRL } from '@/modules/finance/domain/money';
import type { MonthOverview } from '@/modules/finance/application/finance-analytics.queries';

function Card({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${accent ?? 'text-gray-900'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

/**
 * Renda total, gastos confirmados e resultado do mês — sempre visualmente
 * separados de disponível/guardado/total financeiro (seção "Cálculos e
 * transparência" do plano): são fotografias de coisas diferentes.
 */
export function FinanceMonthSummaryCards({ overview }: { overview: MonthOverview }) {
  const resultAccent = overview.resultCents >= 0 ? 'text-green-700' : 'text-red-700';
  return (
    <section aria-label="Resumo do mês">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card label="Renda total do mês" value={centsToBRL(overview.totalIncomeCents)} hint="Somente valores informados manualmente" />
        <Card label="Gastos confirmados" value={centsToBRL(overview.expenseCents)} hint="Só transações confirmadas" />
        <Card label="Resultado do mês" value={centsToBRL(overview.resultCents)} accent={resultAccent} hint="Renda total − gastos confirmados" />
      </div>
      <p className="mt-2 text-xs text-gray-500">{overview.summaryText}</p>
    </section>
  );
}

/**
 * Situação atual (disponível/guardado/total) — nunca soma a renda de novo
 * (o disponível já deve incluir a renda recebida).
 */
export function FinanceCashPositionCards({ overview }: { overview: MonthOverview }) {
  return (
    <section aria-label="Situação atual" className="mt-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card label="Dinheiro disponível" value={centsToBRL(overview.availableCashCents)} />
        <Card label="Dinheiro guardado" value={centsToBRL(overview.savedCashCents)} />
        <Card label="Total financeiro" value={centsToBRL(overview.totalFinancialPositionCents)} hint="Disponível + guardado" />
      </div>
      <p className="mt-2 text-xs text-gray-500">{overview.cashPositionText}</p>
      <p className="mt-1 text-xs text-gray-400">
        Resultado do mês e total financeiro são informações diferentes: o resultado compara renda e gastos deste mês; o
        total financeiro é uma fotografia da situação atual, sem somar a renda de novo.
      </p>
    </section>
  );
}

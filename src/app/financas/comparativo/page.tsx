'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Eye, EyeOff } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useQueries } from '@/providers/repository.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import { todayDateStr } from '@/lib/dates';
import { useHideValuesPreference } from '@/lib/use-hide-values';
import { buildCardComparison } from '@/modules/finance/cash/domain/card-comparison';
import { monthShortLabel } from '@/modules/finance/cash/domain/month';
import { ComparisonChart } from '@/components/finance-cash/comparison-chart';
import { Card, HideValuesContext } from '@/components/finance-cash/ui';

const RANGES = [6, 12, 24] as const;

/**
 * Comparativo entre meses: meta conjunta × gasto efetivo lançado nos cartões.
 * Fica numa rota própria para a página inicial de Finanças continuar mostrando
 * um mês só. Não altera nada: só lê.
 */
export default function ComparativoPage() {
  const { financeCash } = useQueries();
  const today = useMemo(() => todayDateStr(), []);
  const [months, setMonths] = useState<(typeof RANGES)[number]>(12);
  const [hidden, toggleHidden] = useHideValuesPreference();
  const { data, isLoading, error, isOffline, refetch } = useReactiveQuery(() => financeCash.getSnapshot(today), [today]);

  const result = useMemo(() => (data ? buildCardComparison({ today, invoices: data.invoices, goals: data.goals, months }) : null), [data, today, months]);

  return (
    <HideValuesContext.Provider value={hidden}>
      <div className="mx-auto max-w-3xl space-y-4 p-4 pb-24 md:p-8">
        <Link href="/financas" className="inline-flex min-h-11 items-center gap-1 text-sm text-[var(--accent)]"><ArrowLeft size={14} /> Finanças</Link>
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold"><BarChart3 size={24} className="text-[var(--accent)]" /> Comparar meses</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Nossa meta dos cartões × o que foi lançado nas faturas.</p>
          </div>
          <button
            type="button"
            onClick={toggleHidden}
            aria-pressed={hidden}
            aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text-muted)]"
          >
            {hidden ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </header>

        {error && <DataErrorNotice isOffline={isOffline} onRetry={refetch} />}
        {!error && isLoading && !data && <p className="text-sm text-[var(--text-muted)]">Carregando…</p>}

        {!error && data && result && (
          <>
            <div role="group" aria-label="Quantidade de meses" className="flex gap-2">
              {RANGES.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={months === n}
                  onClick={() => setMonths(n)}
                  className={`min-h-11 flex-1 rounded-xl border px-3 text-sm font-medium ${months === n ? 'border-[var(--accent)] bg-[var(--surface-raised)]' : 'border-[var(--line)] text-[var(--text-muted)]'}`}
                >
                  {n} meses
                </button>
              ))}
            </div>

            <Card aria-label="Gráfico de metas e gastos">
              <ComparisonChart result={result} />
            </Card>

            {result.monthsWithoutGoal.length > 0 && (
              <Card aria-label="Períodos sem meta">
                <h2 className="text-sm font-semibold">Períodos sem meta</h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {data.goalsAvailable
                    ? <>Sem meta definida em: {result.monthsWithoutGoal.map(monthShortLabel).join(', ')}. Defina em Finanças, no card “Nossa meta dos cartões” do mês.</>
                    : 'A atualização do banco para a meta mensal ainda não foi aplicada, por isso nenhum mês tem meta.'}
                </p>
              </Card>
            )}
            <p className="text-xs text-[var(--text-muted)]">
              Mês fechado = faturas dos dois cartões fechadas ou pagas. Mês incompleto ou em curso mostra só o valor já lançado e ainda pode subir. Estimativas pela média nunca entram neste gráfico.
            </p>
          </>
        )}
      </div>
    </HideValuesContext.Provider>
  );
}

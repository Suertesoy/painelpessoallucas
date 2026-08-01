'use client';

import { centsToBRL } from '@/modules/finance/domain/money';
import type { MonthlyEvolutionPoint } from '@/modules/finance/domain/analytics';

function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split('-');
  const MONTH_NAMES = [
    'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez',
  ];
  const index = Number(monthNum) - 1;
  return `${MONTH_NAMES[index] ?? monthNum}/${year.slice(2)}`;
}

/**
 * Evolução mensal dos gastos confirmados. Só aparece quando há meses
 * suficientes (decisão da página que a usa) — nunca mostra uma evolução
 * parcial como se fosse a visão completa.
 */
export function FinanceEvolutionChart({ points }: { points: MonthlyEvolutionPoint[] }) {
  if (points.length < 2) {
    return (
      <p className="mt-2 text-sm text-gray-500">
        Ainda não há meses suficientes com transações confirmadas para mostrar a evolução.
      </p>
    );
  }

  const maxCents = Math.max(...points.map((p) => Math.abs(p.totalExpenseCents)), 1);

  return (
    <div>
      <ul className="mt-3 flex items-end gap-2" aria-label="Evolução mensal dos gastos confirmados">
        {points.map((point) => {
          const heightPercent = Math.max(4, Math.round((Math.abs(point.totalExpenseCents) / maxCents) * 100));
          return (
            <li key={point.month} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[11px] text-gray-500">{centsToBRL(point.totalExpenseCents)}</span>
              <div className="flex h-24 w-full items-end">
                <div className="w-full rounded-t bg-blue-500" style={{ height: `${heightPercent}%` }} />
              </div>
              <span className="text-xs font-medium text-gray-600">{formatMonthLabel(point.month)}</span>
            </li>
          );
        })}
      </ul>

      <table className="sr-only">
        <caption>Tabela textual equivalente à evolução mensal dos gastos confirmados</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col">Gastos confirmados</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.month}>
              <td>{formatMonthLabel(point.month)}</td>
              <td>{centsToBRL(point.totalExpenseCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

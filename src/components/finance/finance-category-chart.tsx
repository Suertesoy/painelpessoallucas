'use client';

import { centsToBRL } from '@/modules/finance/domain/money';
import type { CategoryBreakdownEntry } from '@/modules/finance/domain/analytics';

/**
 * Gastos por categoria em barras CSS, cada uma com rótulo de texto visível
 * (nome, valor, percentual) — nunca depende só de cor/largura/posição.
 * Duplicado como lista/tabela textual logo abaixo para garantir alternativa
 * acessível equivalente.
 */
export function FinanceCategoryChart({ breakdown }: { breakdown: CategoryBreakdownEntry[] }) {
  if (breakdown.length === 0) {
    return (
      <p className="mt-2 text-sm text-gray-500">
        Nenhum gasto confirmado neste mês ainda para mostrar por categoria.
      </p>
    );
  }

  const maxCents = Math.max(...breakdown.map((b) => Math.abs(b.totalCents)), 1);

  return (
    <div>
      <ul className="mt-3 space-y-2" aria-label="Gastos por categoria">
        {breakdown.map((entry) => {
          const widthPercent = Math.max(2, Math.round((Math.abs(entry.totalCents) / maxCents) * 100));
          return (
            <li key={entry.categoryId}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-gray-800">{entry.categoryName}</span>
                <span className="shrink-0 text-gray-600">
                  {centsToBRL(entry.totalCents)} · {entry.percentage}%
                </span>
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-gray-100" role="presentation">
                <div
                  className={`h-2 rounded-full ${entry.totalCents < 0 ? 'bg-green-500' : 'bg-blue-500'}`}
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <table className="sr-only">
        <caption>Tabela textual equivalente ao gráfico de gastos por categoria</caption>
        <thead>
          <tr>
            <th scope="col">Categoria</th>
            <th scope="col">Valor</th>
            <th scope="col">Percentual dos gastos</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.map((entry) => (
            <tr key={entry.categoryId}>
              <td>{entry.categoryName}</td>
              <td>{centsToBRL(entry.totalCents)}</td>
              <td>{entry.percentage}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

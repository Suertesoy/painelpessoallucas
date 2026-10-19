'use client';

import { centsToBRL } from '@/modules/finance/domain/money';
import { monthShortLabel } from '@/modules/finance/cash/domain/month';
import { CARD_LABELS } from '@/modules/finance/cash/domain/month';
import type { ComparisonResult, ComparisonRow, ComparisonStatus } from '@/modules/finance/cash/domain/card-comparison';
import { useHideValues } from './ui';
import { titleMonth } from './month-parts';

/**
 * Gráfico de barras simples (sem biblioteca): gasto lançado nos cartões por mês,
 * com a meta como linha tracejada. Cor nunca é a única pista:
 *  - barra SÓLIDA = mês fechado; barra LISTRADA = mês incompleto ou ainda em curso;
 *  - linha tracejada = meta do mês (ausente = "sem meta" escrito embaixo);
 *  - "▲" + texto = acima da meta.
 * A tabela logo abaixo traz os valores exatos, e cada barra tem descrição para leitor de tela.
 */

export const STATUS_TEXT: Record<ComparisonStatus, string> = {
  closed: 'Fechado',
  open: 'Fatura aberta',
  missing: 'Sem fatura',
  future: 'Em curso/futuro',
};

function money(cents: number, hidden: boolean): string {
  return hidden ? 'R$ ••••' : centsToBRL(cents);
}

export function describeRow(r: ComparisonRow, hidden = false): string {
  const goal = r.goalCents === null ? 'sem meta definida' : `meta ${money(r.goalCents, hidden)}`;
  const diff = r.differenceCents === null ? '' : r.differenceCents >= 0 ? `, ${money(r.differenceCents, hidden)} abaixo da meta` : `, ${money(-r.differenceCents, hidden)} acima da meta`;
  return `${titleMonth(r.month)}: ${money(r.spentCents, hidden)} lançados nos cartões, ${goal}${diff}. Situação: ${STATUS_TEXT[r.status]}.`;
}

export function ComparisonChart({ result }: { result: ComparisonResult }) {
  const hidden = useHideValues();
  const max = result.maxCents || 1;
  return (
    <div>
      <div className="overflow-x-auto pb-2" role="group" aria-label="Meta mensal versus gasto nos cartões, por mês">
        <ol className="flex min-w-max items-end gap-2">
          {result.rows.map((r) => {
            const barPct = Math.max(r.spentCents > 0 ? 2 : 0, Math.round((r.spentCents / max) * 100));
            const goalPct = r.goalCents === null ? null : Math.round((r.goalCents / max) * 100);
            const solid = r.status === 'closed';
            return (
              <li key={r.month} className="w-12 shrink-0" aria-label={describeRow(r, hidden)}>
                <div className="relative h-44 w-full" aria-hidden="true">
                  <div
                    className={`absolute inset-x-1 bottom-0 rounded-t-md border ${r.overGoal ? 'border-[var(--money-warning)]' : 'border-[var(--accent)]'} ${solid ? 'bg-[var(--accent)]' : 'bg-[var(--surface-inset)]'}`}
                    style={{
                      height: `${barPct}%`,
                      ...(solid ? {} : { backgroundImage: 'repeating-linear-gradient(135deg, var(--accent) 0 2px, transparent 2px 7px)' }),
                    }}
                  />
                  {goalPct !== null && (
                    <div className="absolute inset-x-0 border-t-2 border-dashed border-[var(--foreground)]" style={{ bottom: `${goalPct}%` }} />
                  )}
                </div>
                <div className="mt-1 text-center" aria-hidden="true">
                  <p className="text-[11px] font-medium leading-tight">{monthShortLabel(r.month)}</p>
                  <p className="text-[10px] leading-tight text-[var(--text-muted)]">{r.goalCents === null ? 'sem meta' : r.overGoal ? '▲ acima' : 'ok'}</p>
                  <p className="text-[10px] leading-tight text-[var(--text-muted)]">{solid ? 'fechado' : r.status === 'future' ? 'em curso' : 'parcial'}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]" aria-label="Legenda">
        <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm border border-[var(--accent)] bg-[var(--accent)]" /> Mês fechado (faturas fechadas/pagas)</li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm border border-[var(--accent)]" style={{ backgroundImage: 'repeating-linear-gradient(135deg, var(--accent) 0 2px, transparent 2px 6px)' }} /> Incompleto ou em curso (valor parcial)
        </li>
        <li className="flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dashed border-[var(--foreground)]" /> Meta do mês</li>
        <li>▲ Gasto lançado acima da meta</li>
      </ul>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <caption className="pb-2 text-left text-xs text-[var(--text-muted)]">Valores exatos. “Gasto” é só o que está lançado nas faturas (parcelas importadas já estão dentro delas).</caption>
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-xs text-[var(--text-muted)]">
              <th scope="col" className="py-1.5 pr-2 font-medium">Mês</th>
              <th scope="col" className="py-1.5 pr-2 text-right font-medium">Meta</th>
              <th scope="col" className="py-1.5 pr-2 text-right font-medium">Gasto lançado</th>
              <th scope="col" className="py-1.5 pr-2 text-right font-medium">Diferença</th>
              <th scope="col" className="py-1.5 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {[...result.rows].reverse().map((r) => (
              <tr key={r.month} className="border-b border-[var(--line)] align-top">
                <th scope="row" className="py-2 pr-2 text-left font-medium">{titleMonth(r.month)}</th>
                <td className="tabular py-2 pr-2 text-right">{r.goalCents === null ? <span className="text-[var(--text-muted)]">sem meta</span> : money(r.goalCents, hidden)}</td>
                <td className="tabular py-2 pr-2 text-right">
                  {money(r.spentCents, hidden)}
                  <span className="block text-[11px] text-[var(--text-muted)]">
                    {r.byCard.map((c) => `${CARD_LABELS[c.card]} ${c.status ? money(c.cents, hidden) : '—'}`).join(' · ')}
                  </span>
                </td>
                <td className="tabular py-2 pr-2 text-right">
                  {r.differenceCents === null ? '—' : r.differenceCents >= 0 ? `sobra ${money(r.differenceCents, hidden)}` : `▲ passou ${money(-r.differenceCents, hidden)}`}
                </td>
                <td className="py-2 text-xs">{STATUS_TEXT[r.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MAX_FUTURE_MONTHS, MAX_PAST_MONTHS } from '@/modules/finance/cash/domain/month-view';
import { addMonths, monthLabel, monthsBetween, type MonthKey } from '@/modules/finance/cash/domain/month';
import { Money } from './ui';

/** "outubro de 2026" → "Outubro de 2026". */
export function titleMonth(month: MonthKey): string {
  const label = monthLabel(month);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Cabeçalho de navegação por mês: seta para o anterior, seta para o próximo e
 * retorno simples ao mês atual. Mês e ano em destaque; área de toque ≥ 44px.
 */
export function MonthNavigator({ month, currentMonth, onChange }: { month: MonthKey; currentMonth: MonthKey; onChange: (m: MonthKey) => void }) {
  const delta = monthsBetween(currentMonth, month);
  return (
    <nav aria-label="Navegação por mês" className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onChange(addMonths(month, -1))}
          disabled={delta <= -MAX_PAST_MONTHS}
          aria-label="Mês anterior"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] text-[var(--foreground)] disabled:opacity-40"
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p aria-live="polite" data-testid="selected-month" className="truncate text-xl font-bold leading-tight">{titleMonth(month)}</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {delta === 0 ? 'Mês atual' : delta < 0 ? (delta === -1 ? 'Mês passado' : 'Mês anterior') : delta === 1 ? 'Próximo mês' : 'Mês futuro'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange(addMonths(month, 1))}
          disabled={delta >= MAX_FUTURE_MONTHS}
          aria-label="Próximo mês"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] text-[var(--foreground)] disabled:opacity-40"
        >
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      </div>
      {delta !== 0 && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => onChange(currentMonth)}
            className="min-h-10 rounded-full border border-[var(--line-strong)] px-4 text-sm font-medium text-[var(--accent)]"
          >
            Voltar ao mês atual
          </button>
        </div>
      )}
    </nav>
  );
}

/**
 * Barra "feito × pendente" de um total (recebido/previsto, pago/a pagar). O
 * significado também está no texto ao lado — a cor nunca é a única pista.
 */
export function SplitBar({ label, totalCents, doneCents, doneLabel, pendingLabel, tone = 'default' }: {
  label: string; totalCents: number; doneCents: number; doneLabel: string; pendingLabel: string; tone?: 'default' | 'positive';
}) {
  const pct = totalCents > 0 ? Math.min(100, Math.round((doneCents / totalCents) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm">{label}</span>
        <Money cents={totalCents} size="md" tone={tone === 'positive' ? 'positive' : 'default'} />
      </div>
      <div
        role="progressbar"
        aria-label={`${label}: ${doneLabel} ${pct}%`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-[var(--surface-inset)] ring-1 ring-[var(--line)]"
      >
        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-[var(--text-muted)]">
        <span>{doneLabel} <Money cents={doneCents} size="sm" tone="muted" /></span>
        <span>{pendingLabel} <Money cents={Math.max(0, totalCents - doneCents)} size="sm" tone="muted" /></span>
      </p>
    </div>
  );
}

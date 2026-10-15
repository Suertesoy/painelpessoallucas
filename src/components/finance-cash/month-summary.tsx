'use client';

import { useMemo, useState } from 'react';
import type { MonthLine, MonthProjection } from '@/modules/finance/cash/domain/projection';
import type { CardEstimate } from '@/modules/finance/cash/domain/card-estimate';
import { MIN_HISTORY_INVOICES } from '@/modules/finance/cash/domain/card-estimate';
import { CARD_FULL_LABELS, monthLabel } from '@/modules/finance/cash/domain/month';
import { Card, Money } from './ui';

/**
 * Resumo do mês + composição do cálculo.
 *
 * Primeiro o resultado em linguagem simples; a composição (de onde vem o
 * número) fica um toque abaixo. A composição separa duas coisas:
 *  - o que ENTROU e SAIU durante o mês (fluxo do mês);
 *  - quanto ficou ACUMULADO ao fim do mês (traz o resultado dos meses anteriores).
 */

function Row({ label, cents, sign, tone = 'default', strong = false }: {
  label: string; cents: number; sign?: '+' | '−'; tone?: 'default' | 'positive' | 'negative' | 'muted'; strong?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1 ${strong ? 'border-t border-[var(--line)] pt-2 font-medium' : ''}`}>
      <span className="text-[var(--text-muted)]">{sign ? `${sign} ` : ''}{label}</span>
      <Money cents={cents} size="sm" tone={tone} />
    </div>
  );
}

function Lines({ lines, sign, tone }: { lines: MonthLine[]; sign: '+' | '−'; tone?: 'positive' }) {
  return (
    <>
      {lines.map((l, i) => (
        <Row key={`${l.id}-${i}`} label={l.overdue ? `${l.label} (atrasado)` : l.label} cents={l.amountCents} sign={sign} tone={tone} />
      ))}
    </>
  );
}

export function MonthBreakdown({ month, isFirst, estimate }: { month: MonthProjection; isFirst: boolean; estimate?: { monthCents: number; cumulativeCents: number } | null }) {
  const flow = month.inflowCents - month.committedCents;
  const outflowLines = month.directLines.length + month.invoiceLines.length + month.cardFixedLines.filter((l) => l.countedCents > 0).length;
  return (
    <div className="space-y-4 text-sm">
      <section aria-label="O que entra e sai neste mês">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Durante o mês</h4>
        <Lines lines={month.fixedIncomeLines} sign="+" tone="positive" />
        <Lines lines={month.receipts} sign="+" tone="positive" />
        {month.fixedIncomeLines.length + month.receipts.length === 0 && (
          <p className="py-1 text-[var(--text-muted)]">Nenhuma entrada prevista.</p>
        )}
        <Lines lines={month.directLines} sign="−" />
        {month.invoiceLines.map((l) => (
          <Row key={l.id} label={`${l.label}${l.hasAmount ? '' : ' (sem valor)'}`} cents={l.amountCents} sign="−" />
        ))}
        {month.cardFixedLines.filter((l) => l.countedCents > 0).map((l) => (
          <Row key={`${l.id}-${l.card}`} label={`${l.label} (${CARD_FULL_LABELS[l.card]}, sem fatura ainda)`} cents={l.countedCents} sign="−" />
        ))}
        {outflowLines === 0 && <p className="py-1 text-[var(--text-muted)]">Nenhuma conta ou fatura prevista.</p>}
        <Row label="Resultado do mês (entrou − saiu)" cents={flow} tone={flow < 0 ? 'negative' : 'default'} strong />
      </section>

      <section aria-label="Quanto fica acumulado">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Acumulado até o fim do mês</h4>
        <Row label={isFirst ? 'Saldo disponível hoje' : 'Trazido do mês anterior'} cents={month.openingCents} tone={month.openingCents < 0 ? 'negative' : 'default'} />
        <Row label="Resultado do mês" cents={flow} sign="+" tone={flow < 0 ? 'negative' : 'default'} />
        <Row label="Acumulado ao fim do mês" cents={month.resultCents} tone={month.resultCents < 0 ? 'negative' : 'default'} strong />
      </section>

      {estimate && (
        <section aria-label="Estimativa de gastos no cartão" className="rounded-lg bg-[var(--surface)] p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Estimativa (não confirmada)</h4>
          <Row label="Gastos no cartão que ainda não aparecem" cents={estimate.monthCents} sign="−" tone="muted" />
          <Row label="Acumulado considerando a estimativa" cents={month.resultCents - estimate.cumulativeCents} tone={month.resultCents - estimate.cumulativeCents < 0 ? 'negative' : 'muted'} strong />
        </section>
      )}

      {month.uncertainReceiptsCents > 0 && (
        <p className="text-xs text-[var(--text-muted)]">Fora da conta: <Money cents={month.uncertainReceiptsCents} size="sm" tone="muted" /> em recebimentos incertos.</p>
      )}
      {month.warnings.map((w) => <p key={w} className="text-xs text-[var(--money-warning)]">{w}</p>)}
    </div>
  );
}

/** Resultado do mês atual em uma frase, com a composição um toque abaixo. */
export function CurrentMonthCard({ month, balanceInformed, estimate }: { month: MonthProjection; balanceInformed: boolean; estimate?: { monthCents: number; cumulativeCents: number } | null }) {
  const covered = month.needCents === 0;
  return (
    <Card aria-label="Quanto sobra depois do combinado">
      <h2 className="text-sm font-medium text-[var(--text-muted)] capitalize">{monthLabel(month.month)}</h2>
      <p className="mt-2 text-sm">{covered ? 'Sobra depois do que já está combinado' : 'Falta para cobrir o que já está combinado'}</p>
      <div className="mt-1">
        <Money cents={covered ? month.resultCents : month.needCents} size="xl" tone={covered ? 'positive' : 'warning'} />
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Considera o saldo disponível, as entradas, as contas e as faturas já lançadas. A reserva não entra. Gastos que ainda não aparecem em fatura (mercado, lazer, imprevistos) não estão incluídos.
      </p>
      {!balanceInformed && <p className="mt-2 text-xs text-[var(--money-warning)]">Você ainda não informou o saldo disponível — o cálculo parte de zero.</p>}
      <details className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface-inset)]">
        <summary className="cursor-pointer p-3 text-sm font-medium">Como chegamos nesse valor</summary>
        <div className="border-t border-[var(--line)] p-3">
          <MonthBreakdown month={month} isFirst estimate={estimate} />
        </div>
      </details>
    </Card>
  );
}

/** Próximos meses (composição por mês) + estimativa opcional de cartão. */
export function UpcomingMonths({ months, estimate }: { months: MonthProjection[]; estimate: CardEstimate }) {
  const [withEstimate, setWithEstimate] = useState(false);
  const upcoming = months.slice(1);
  const byMonth = useMemo(() => new Map(estimate.months.map((m) => [m.month, m])), [estimate]);
  return (
    <Card aria-label="Próximos meses">
      <h2 className="text-base font-semibold">Próximos meses</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Cada mês começa com o que ficou acumulado no anterior. Só entram as obrigações já conhecidas: uma fatura futura pequena não significa um mês de poucos gastos.
      </p>
      <div className="mt-3 space-y-2">
        {upcoming.map((m) => {
          const est = withEstimate && estimate.enough ? byMonth.get(m.month) : null;
          const shown = est ? m.resultCents - est.cumulativeCents : m.resultCents;
          return (
            <details key={m.month} className="rounded-xl border border-[var(--line)] bg-[var(--surface-inset)]">
              <summary className="flex cursor-pointer items-center justify-between gap-3 p-3.5">
                <span className="text-sm font-medium capitalize">{monthLabel(m.month)}</span>
                <span className="flex items-baseline gap-1.5 text-sm">
                  <span className="text-[var(--text-muted)]">{shown < 0 ? 'falta' : 'sobra'}</span>
                  <Money cents={Math.abs(shown)} size="sm" tone={shown < 0 ? 'warning' : 'positive'} />
                </span>
              </summary>
              <div className="border-t border-[var(--line)] p-3.5">
                <MonthBreakdown month={m} isFirst={false} estimate={est ? { monthCents: est.cents, cumulativeCents: est.cumulativeCents } : null} />
              </div>
            </details>
          );
        })}
      </div>
      <div className="mt-4 border-t border-[var(--line)] pt-3">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={withEstimate} onChange={(e) => setWithEstimate(e.target.checked)} />
          Incluir estimativa de gastos no cartão
        </label>
        {withEstimate && (
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {estimate.enough
              ? `Estimativa baseada na média das últimas faturas fechadas de ${estimate.byCard.map((c) => `${CARD_FULL_LABELS[c.card]} (${c.basedOnInvoices})`).join(' e ')}. Já desconta o que cada fatura e os gastos fixos no cartão somam. Não é um valor confirmado.`
              : `Ainda não há histórico suficiente para estimar: são necessárias pelo menos ${MIN_HISTORY_INVOICES} faturas de meses anteriores por cartão.`}
            {estimate.enough && estimate.insufficientCards.length > 0 &&
              ` Sem estimativa para ${estimate.insufficientCards.map((c) => CARD_FULL_LABELS[c]).join(' e ')} (histórico insuficiente).`}
          </p>
        )}
      </div>
    </Card>
  );
}

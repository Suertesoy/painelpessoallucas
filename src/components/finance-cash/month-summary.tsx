'use client';

import type { MonthLine, MonthProjection } from '@/modules/finance/cash/domain/projection';
import { HISTORY_INVOICES, type CardEstimate } from '@/modules/finance/cash/domain/card-estimate';
import { CARD_FULL_LABELS, monthLabel, monthShortLabel } from '@/modules/finance/cash/domain/month';
import { Card, Money } from './ui';

/**
 * Resumo do mês + composição do cálculo.
 *
 * Três números, nesta ordem, sempre separando o que é CONFIRMADO do que é
 * ESTIMADO:
 *  1. Sobra considerando compromissos conhecidos (valores reais);
 *  2. Estimativa de gastos futuros no cartão (média das 3 últimas faturas
 *     completas de cada cartão; não confirmada);
 *  3. Sobra provável depois das estimativas.
 * A composição mostra, por mês, o que entrou e saiu (fluxo) e quanto ficou
 * acumulado ao fim do mês.
 */

type MonthEstimate = { monthCents: number; cumulativeCents: number };

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

/** Quando a estimativa não existe, diz exatamente o que falta (nunca finge que é zero). */
export function estimateLimitation(estimate: CardEstimate): string | null {
  if (estimate.insufficientCards.length === 0) return null;
  const parts = estimate.insufficientCards.map((c) => `${CARD_FULL_LABELS[c]}: ${estimate.availableByCard[c]} de ${HISTORY_INVOICES} faturas completas`);
  return `Sem estimativa para ${parts.join('; ')}. Importe as faturas dos últimos meses (podem estar pagas) para estimar.`;
}

function monthEstimate(estimate: CardEstimate, month: string): MonthEstimate | null {
  if (!estimate.enough) return null;
  const m = estimate.months.find((x) => x.month === month);
  return m ? { monthCents: m.cents, cumulativeCents: m.cumulativeCents } : null;
}

export function MonthBreakdown({ month, isFirst, estimate }: { month: MonthProjection; isFirst: boolean; estimate?: MonthEstimate | null }) {
  const flow = month.inflowCents - month.committedCents;
  const outflowLines = month.directLines.length + month.invoiceLines.length + month.cardFixedLines.filter((l) => l.countedCents > 0).length;
  return (
    <div className="space-y-4 text-sm">
      <section aria-label="O que entra e sai neste mês (valores reais)">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Durante o mês · valores reais</h4>
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

      <section aria-label="Quanto fica acumulado (valores reais)">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Acumulado até o fim do mês · valores reais</h4>
        <Row label={isFirst ? 'Saldo disponível hoje' : 'Trazido do mês anterior'} cents={month.openingCents} tone={month.openingCents < 0 ? 'negative' : 'default'} />
        <Row label="Resultado do mês" cents={flow} sign="+" tone={flow < 0 ? 'negative' : 'default'} />
        <Row label="Acumulado ao fim do mês" cents={month.resultCents} tone={month.resultCents < 0 ? 'negative' : 'default'} strong />
      </section>

      {estimate && (
        <section aria-label="Estimativa de gastos no cartão" className="rounded-lg bg-[var(--surface)] p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Estimativa · não confirmada</h4>
          <Row label="Gastos no cartão ainda não lançados neste mês" cents={estimate.monthCents} sign="−" tone="muted" />
          <Row label="Estimativa acumulada até aqui" cents={estimate.cumulativeCents} sign="−" tone="muted" />
          <Row label="Sobra provável ao fim do mês" cents={month.resultCents - estimate.cumulativeCents} tone={month.resultCents - estimate.cumulativeCents < 0 ? 'negative' : 'muted'} strong />
        </section>
      )}

      {month.uncertainReceiptsCents > 0 && (
        <p className="text-xs text-[var(--text-muted)]">Fora da conta: <Money cents={month.uncertainReceiptsCents} size="sm" tone="muted" /> em recebimentos incertos.</p>
      )}
      {month.warnings.map((w) => <p key={w} className="text-xs text-[var(--money-warning)]">{w}</p>)}
    </div>
  );
}

/** Resultado do mês atual em três linhas: conhecido, estimativa e provável. */
export function CurrentMonthCard({ month, balanceInformed, estimate }: { month: MonthProjection; balanceInformed: boolean; estimate: CardEstimate }) {
  const est = monthEstimate(estimate, month.month);
  const known = month.resultCents;
  const probable = est ? known - est.cumulativeCents : known;
  const headline = est ? probable : known;
  const limitation = estimateLimitation(estimate);
  return (
    <Card aria-label="Quanto sobra">
      <h2 className="text-sm font-medium text-[var(--text-muted)] capitalize">{monthLabel(month.month)}</h2>

      <p className="mt-2 text-sm">{est ? (headline >= 0 ? 'Sobra provável depois das estimativas' : 'Falta provável depois das estimativas') : (headline >= 0 ? 'Sobra considerando o que já está combinado' : 'Falta para cobrir o que já está combinado')}</p>
      <div className="mt-1">
        <Money cents={Math.abs(headline)} size="xl" tone={headline >= 0 ? 'positive' : 'warning'} />
      </div>

      <div className="mt-4 space-y-0.5 border-t border-[var(--line)] pt-3 text-sm">
        <Row label="Sobra considerando compromissos conhecidos" cents={known} tone={known < 0 ? 'negative' : 'default'} />
        {est && <Row label="Estimativa de gastos futuros no cartão (não confirmada)" cents={est.cumulativeCents} sign="−" tone="muted" />}
        {est && <Row label="Sobra provável depois das estimativas" cents={probable} tone={probable < 0 ? 'negative' : 'default'} strong />}
      </div>

      {limitation && <p className="mt-3 text-xs text-[var(--text-muted)]">{limitation}</p>}
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Considera o saldo disponível, as entradas, as contas e as faturas lançadas. A reserva não entra. Gastos fora do cartão ainda não registrados não estão incluídos.
      </p>
      {!balanceInformed && <p className="mt-2 text-xs text-[var(--money-warning)]">Você ainda não informou o saldo disponível — o cálculo parte de zero.</p>}
      <details className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface-inset)]">
        <summary className="min-h-11 cursor-pointer p-3 text-sm font-medium">Como chegamos nesse valor</summary>
        <div className="border-t border-[var(--line)] p-3">
          <MonthBreakdown month={month} isFirst estimate={est} />
        </div>
      </details>
    </Card>
  );
}

/** Próximos meses (composição por mês); cada linha mostra o valor provável quando há estimativa. */
export function UpcomingMonths({ months, estimate }: { months: MonthProjection[]; estimate: CardEstimate }) {
  const estimateLimit = estimateLimitation(estimate);
  const upcoming = months.slice(1);
  return (
    <Card aria-label="Próximos meses">
      <h2 className="text-base font-semibold">Próximos meses</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Cada mês começa com o que ficou acumulado no anterior. {estimate.enough
          ? 'O valor de cada mês é a sobra provável: inclui a estimativa de gastos no cartão, que não é um valor confirmado.'
          : 'Só entram as obrigações já conhecidas: uma fatura futura pequena não significa um mês de poucos gastos.'}
      </p>
      <div className="mt-3 space-y-2">
        {upcoming.map((m) => {
          const est = monthEstimate(estimate, m.month);
          const shown = est ? m.resultCents - est.cumulativeCents : m.resultCents;
          return (
            <details key={m.month} className="rounded-xl border border-[var(--line)] bg-[var(--surface-inset)]">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 p-3.5">
                <span className="text-sm font-medium capitalize">{monthLabel(m.month)}</span>
                <span className="flex items-baseline gap-1.5 text-sm">
                  <span className="text-[var(--text-muted)]">{est ? (shown < 0 ? 'falta provável' : 'sobra provável') : (shown < 0 ? 'falta' : 'sobra')}</span>
                  <Money cents={Math.abs(shown)} size="sm" tone={shown < 0 ? 'warning' : 'positive'} />
                </span>
              </summary>
              <div className="border-t border-[var(--line)] p-3.5">
                <MonthBreakdown month={m} isFirst={false} estimate={est} />
              </div>
            </details>
          );
        })}
      </div>

      <div className="mt-4 space-y-1 border-t border-[var(--line)] pt-3 text-xs text-[var(--text-muted)]">
        {estimate.byCard.map((c) => (
          <p key={c.card}>
            Média de {CARD_FULL_LABELS[c.card]}: <Money cents={c.averageCents} size="sm" tone="muted" /> por fatura (vencimentos em {c.basedOnMonths.map(monthShortLabel).join(', ')}).
          </p>
        ))}
        {estimateLimit && <p>{estimateLimit}</p>}
        <p>Quando uma fatura fecha, o valor real substitui a estimativa daquele mês. Faturas ainda abertas usam o maior entre o já lançado e a média.</p>
      </div>
    </Card>
  );
}

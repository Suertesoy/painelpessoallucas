'use client';

import type { MonthProjection } from '@/modules/finance/cash/domain/projection';
import type { ProjectedInstallment } from '@/modules/finance/cash/domain/installments';
import { CARD_FULL_LABELS, monthLabel, monthShortLabel } from '@/modules/finance/cash/domain/month';
import { Card, Chip, Eyebrow, Money } from './ui';

export function CoverageCard({ month, balanceInformed }: { month: MonthProjection; balanceInformed: boolean }) {
  const covered = month.needCents === 0;
  return (
    <Card aria-label="Quanto falta cobrir no mês" className={covered ? '' : 'border-[var(--money-warning)]/40'}>
      <Eyebrow>{covered ? 'Neste mês' : 'Falta ganhar neste mês'}</Eyebrow>
      <div className="mt-1">
        {covered ? (
          <div className="flex items-baseline gap-2">
            <Money cents={month.resultCents} size="xl" tone="positive" />
            <span className="text-sm text-[var(--text-muted)]">sobram depois de pagar tudo</span>
          </div>
        ) : (
          <div className="flex items-baseline gap-2">
            <Money cents={month.needCents} size="xl" tone="warning" />
            <span className="text-sm text-[var(--text-muted)]">para cobrir tudo sem usar a reserva</span>
          </div>
        )}
      </div>
      <dl className="mt-4 space-y-1.5 text-sm">
        <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Disponível</dt><dd><Money cents={month.openingCents} size="sm" /></dd></div>
        <div className="flex justify-between"><dt className="text-[var(--text-muted)]">+ A receber (confirmado)</dt><dd><Money cents={month.inflowCents} size="sm" tone="positive" /></dd></div>
        <div className="flex justify-between"><dt className="text-[var(--text-muted)]">− Comprometido</dt><dd><Money cents={month.committedCents} size="sm" /></dd></div>
        <div className="flex justify-between border-t border-[var(--line)] pt-1.5"><dt>Resultado projetado</dt><dd><Money cents={month.resultCents} size="sm" tone={month.resultCents < 0 ? 'negative' : 'default'} /></dd></div>
      </dl>
      <div className="mt-3 space-y-1 text-xs text-[var(--text-muted)]">
        <p>Considera só o que já está lançado: gastos ainda não lançados (mercado, lazer, imprevistos) não estão incluídos.</p>
        {!balanceInformed && <p className="text-[var(--money-warning)]">Você ainda não informou o saldo disponível — o cálculo parte de zero.</p>}
        {month.warnings.map((w) => <p key={w} className="text-[var(--money-warning)]">{w}</p>)}
      </div>
    </Card>
  );
}

function MonthRow({ m, installments }: { m: MonthProjection; installments: ProjectedInstallment[] }) {
  const mine = installments.filter((i) => i.month === m.month);
  const installmentsCents = mine.reduce((s, i) => s + i.amountCents, 0);
  return (
    <details className="rounded-xl border border-[var(--line)] bg-[var(--surface-inset)]">
      <summary className="flex cursor-pointer items-center justify-between gap-3 p-3.5">
        <span className="text-sm font-medium capitalize">{monthLabel(m.month)}</span>
        <span className="flex items-center gap-2">
          {m.needCents > 0 ? <Chip tone="warning">falta <Money cents={m.needCents} size="sm" tone="warning" /></Chip> : <Chip tone="positive">sobra <Money cents={m.resultCents} size="sm" tone="positive" /></Chip>}
        </span>
      </summary>
      <div className="space-y-1.5 border-t border-[var(--line)] p-3.5 text-sm">
        <Line label="Saldo inicial considerado" cents={m.openingCents} />
        <Line label="Entradas fixas previstas" cents={m.fixedIncomeCents} tone="positive" />
        <Line label="Recebimentos pontuais confirmados" cents={m.receiptsCents} tone="positive" />
        <Line label="Contas fora dos cartões" cents={m.directCents} />
        {m.invoiceLines.map((l) => (
          <Line key={l.id} label={`${l.label}${l.hasAmount ? '' : ' (sem valor)'}`} cents={l.amountCents} />
        ))}
        {m.cardFixedEstimatedCents > 0 && <Line label="Gastos fixos no cartão ainda sem fatura" cents={m.cardFixedEstimatedCents} />}
        <Line label="Total comprometido" cents={m.committedCents} strong />
        <Line label="Resultado projetado" cents={m.resultCents} tone={m.resultCents < 0 ? 'negative' : 'default'} strong />
        {m.uncertainReceiptsCents > 0 && (
          <p className="text-xs text-[var(--text-muted)]">Fora da conta: <Money cents={m.uncertainReceiptsCents} size="sm" tone="muted" /> em recebimentos incertos.</p>
        )}
        {mine.length > 0 && (
          <div className="mt-2 rounded-lg bg-[var(--surface)] p-2.5 text-xs text-[var(--text-muted)]">
            <p>
              Parcelas previstas ainda não faturadas (estimativa, <strong>não somadas</strong>): <Money cents={installmentsCents} size="sm" tone="muted" />
            </p>
            <ul className="mt-1 list-inside list-disc">
              {mine.slice(0, 6).map((i, idx) => (
                <li key={idx}>{CARD_FULL_LABELS[i.card]} · {i.baseDescription} {i.installmentNo}/{i.installmentTotal}</li>
              ))}
            </ul>
          </div>
        )}
        {m.warnings.map((w) => <p key={w} className="text-xs text-[var(--money-warning)]">{w}</p>)}
      </div>
    </details>
  );
}

function Line({ label, cents, tone = 'default', strong = false }: { label: string; cents: number; tone?: 'default' | 'positive' | 'negative'; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'border-t border-[var(--line)] pt-1.5 font-medium' : ''}`}>
      <span className="text-[var(--text-muted)]">{label}</span>
      <Money cents={cents} size="sm" tone={tone} />
    </div>
  );
}

export function ProjectionSection({ months, installments }: { months: MonthProjection[]; installments: ProjectedInstallment[] }) {
  const upcoming = months.slice(1);
  return (
    <Card aria-label="Projeção dos próximos meses">
      <Eyebrow>Próximos meses</Eyebrow>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Cada mês começa com o resultado do anterior: uma falta continua pesando nos meses seguintes até ser coberta ou até você ajustar o saldo. A reserva nunca entra.
      </p>
      <div className="mt-3 space-y-2">
        {upcoming.map((m) => <MonthRow key={m.month} m={m} installments={installments} />)}
      </div>
      <p className="mt-3 text-xs text-[var(--text-muted)]">
        {upcoming.map((m) => monthShortLabel(m.month)).join(' · ')} — só obrigações conhecidas. Uma fatura futura pequena não significa um mês de poucos gastos.
      </p>
    </Card>
  );
}

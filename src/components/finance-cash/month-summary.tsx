'use client';

import { useState } from 'react';
import type { MonthProjection } from '@/modules/finance/cash/domain/projection';
import { HISTORY_INVOICES, type CardEstimate } from '@/modules/finance/cash/domain/card-estimate';
import { averageUnavailableReason, type MonthSustainability, type SustainabilityCardRow } from '@/modules/finance/cash/domain/sustainability';
import { CARD_FULL_LABELS, monthLabel, monthShortLabel } from '@/modules/finance/cash/domain/month';
import type { Balance } from '@/modules/finance/cash/domain/types';
import { Card, Money } from './ui';

/**
 * Sustentabilidade mensal (indicador principal) + caixa real (área separada).
 *
 * Cada mês é calculado SOZINHO: entradas cadastradas − compromissos − cartões.
 * Nenhum déficit (real ou hipotético) é levado de um mês para o outro. O que já
 * está pendente no caixa, com os valores acumulados, fica em "Caixa real".
 *
 * Três leituras do mês:
 *  1. Compromissos conhecidos — só o que está cadastrado;
 *  2. Mantendo a média dos cartões — hipótese baseada nas últimas 3 faturas;
 *  3. Meta para não usar a reserva — limite combinado dos cartões.
 */

type View = 'known' | 'average' | 'limit';
const VIEW_LABEL: Record<View, string> = { known: 'Conhecido', average: 'Mantendo a média', limit: 'Meta sem a reserva' };

function Row({ label, cents, sign, tone = 'default', strong = false, note }: {
  label: string; cents: number; sign?: '+' | '−'; tone?: 'default' | 'positive' | 'negative' | 'muted'; strong?: boolean; note?: string;
}) {
  return (
    <div className={`py-1 ${strong ? 'border-t border-[var(--line)] pt-2 font-medium' : ''}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[var(--text-muted)]">{sign ? `${sign} ` : ''}{label}</span>
        <Money cents={cents} size="sm" tone={tone} />
      </div>
      {note && <p className="text-xs text-[var(--text-muted)]">{note}</p>}
    </div>
  );
}

/** Quando a média não existe, diz exatamente o que falta (nunca finge que é zero). */
export function estimateLimitation(estimate: CardEstimate): string | null {
  if (estimate.insufficientCards.length === 0) return null;
  const parts = estimate.insufficientCards.map((c) => `${CARD_FULL_LABELS[c]}: ${estimate.availableByCard[c]} de ${HISTORY_INVOICES} faturas completas`);
  return `Sem média para ${parts.join('; ')}. Só faturas fechadas ou pagas contam; importe ou confirme as dos últimos meses.`;
}

function cardRowText(r: SustainabilityCardRow): string {
  const label = CARD_FULL_LABELS[r.card];
  switch (r.kind) {
    case 'real':
      return `${label}: fatura ${r.invoiceStatus === 'paid' ? 'paga' : 'fechada'} — vale o valor real; a média não entra.`;
    case 'partial':
      return `${label}: fatura aberta (parcial). Vale o que já está lançado; só a diferença até a média é estimada.`;
    case 'average':
      return `${label}: ainda sem fatura. Vale a média${r.cardFixedCents > 0 ? ' menos os gastos fixos já conhecidos' : ''}.`;
    default:
      return `${label}: sem média confiável e sem fatura fechada — nada foi estimado.`;
  }
}

/** "Como chegamos a esse valor": cada parcela, médias usadas e o que ficou de fora para não contar em dobro. */
export function SustainabilityBreakdown({ s, cash, estimate }: { s: MonthSustainability; cash: MonthProjection; estimate: CardEstimate }) {
  const excluded = cash.cardFixedLines.filter((l) => l.state !== 'awaiting_invoice');
  return (
    <div className="space-y-4 text-sm">
      <section aria-label="Entradas cadastradas do mês">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Entradas cadastradas</h4>
        {s.incomeLines.length === 0 && <p className="py-1 text-[var(--text-muted)]">Nenhuma entrada cadastrada para este mês.</p>}
        {s.incomeLines.map((l, i) => (
          <Row key={`${l.label}-${i}`} label={`${l.label}${l.done ? ' (já recebida)' : ''}`} cents={l.amountCents} sign="+" tone="positive" />
        ))}
        <Row label="Total de entradas cadastradas" cents={s.incomeCents} strong />
        {s.uncertainIncomeCents > 0 && (
          <p className="text-xs text-[var(--text-muted)]">Fora da conta: <Money cents={s.uncertainIncomeCents} size="sm" tone="muted" /> em recebimentos incertos.</p>
        )}
      </section>

      <section aria-label="Compromissos diretos do mês">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Compromissos diretos</h4>
        {s.directLines.length === 0 && <p className="py-1 text-[var(--text-muted)]">Nenhum compromisso direto neste mês.</p>}
        {s.directLines.map((l, i) => (
          <Row key={`${l.label}-${i}`} label={`${l.label}${l.done ? ' (já pago)' : ''}`} cents={l.amountCents} sign="−" />
        ))}
        <Row label="Total de compromissos diretos" cents={s.directCents} strong />
      </section>

      <section aria-label="Cartões">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Cartões</h4>
        {s.cards.map((r) => (
          <div key={r.card} className="py-1">
            <p className="text-xs text-[var(--text-muted)]">{cardRowText(r)}</p>
            <Row label={r.invoiceStatus ? `Fatura (${r.invoiceStatus === 'paid' ? 'paga' : r.invoiceStatus === 'closed' ? 'fechada' : 'aberta'})` : 'Fatura'} cents={r.invoiceCents} sign="−" note={r.invoiceWithoutAmount ? 'Fatura sem valor informado.' : undefined} />
            {r.cardFixedCents > 0 && <Row label="Gastos fixos no cartão ainda sem fatura" cents={r.cardFixedCents} sign="−" />}
            {r.averageCents !== null && <Row label={`Média das últimas ${HISTORY_INVOICES} faturas (hipótese)`} cents={r.averageCents} tone="muted" />}
            {r.gapCents > 0 && <Row label="Estimativa até a média (hipótese)" cents={r.gapCents} sign="−" tone="muted" />}
          </div>
        ))}
        {estimate.byCard.map((c) => (
          <p key={c.card} className="text-xs text-[var(--text-muted)]">
            Média de {CARD_FULL_LABELS[c.card]}: faturas fechadas/pagas de {c.basedOnMonths.map(monthShortLabel).join(', ')}.
          </p>
        ))}
      </section>

      <section aria-label="Resultados do mês" className="rounded-lg bg-[var(--surface)] p-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Resultado deste mês, isolado</h4>
        <Row label="Conhecido (entradas − diretos − faturas e fixos no cartão)" cents={s.knownResultCents} tone={s.knownResultCents < 0 ? 'negative' : 'default'} />
        {s.averageResultCents !== null && (
          <Row label="Mantendo a média (hipótese)" cents={s.averageResultCents} tone={s.averageResultCents < 0 ? 'negative' : 'default'} />
        )}
        <Row label="Limite combinado dos cartões" cents={s.limit.combinedCents} tone="muted" />
        <p className="mt-1 text-xs text-[var(--text-muted)]">Nada é levado para o mês seguinte. A reserva não é usada.</p>
      </section>

      {excluded.length > 0 && (
        <section aria-label="Não contado em dobro">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Não contado em dobro</h4>
          {excluded.map((l) => (
            <p key={`${l.id}-${l.card}`} className="text-xs text-[var(--text-muted)]">
              {l.label} ({CARD_FULL_LABELS[l.card]}) já está dentro da fatura; não foi somado de novo.
            </p>
          ))}
        </section>
      )}
      <p className="text-xs text-[var(--text-muted)]">
        Faturas pagas e compromissos pagos contam no mês (mês inteiro), mas não aparecem como pendência. Gastos fora do cartão ainda não registrados não estão incluídos.
      </p>
    </div>
  );
}

function verdict(view: View, s: MonthSustainability): { headline: string; cents: number | null; tone: 'positive' | 'warning' | 'muted'; extra: string[] } {
  if (view === 'known') {
    const r = s.knownResultCents;
    return {
      headline: r >= 0 ? 'Com o que está cadastrado, o mês fecha com sobra de' : 'Com o que está cadastrado, os compromissos ultrapassam as entradas do mês em',
      cents: Math.abs(r), tone: r >= 0 ? 'positive' : 'warning', extra: [],
    };
  }
  if (view === 'average') {
    const r = s.averageResultCents;
    if (r === null) return { headline: averageUnavailableReason(s) ?? '', cents: null, tone: 'muted', extra: [] };
    return {
      headline: r >= 0 ? 'Mantendo a média dos cartões, o mês fecha com sobra de' : 'Mantendo a média dos cartões, seus gastos previstos ultrapassam as entradas do mês em',
      cents: Math.abs(r), tone: r >= 0 ? 'positive' : 'warning',
      extra: ['Este cenário é uma estimativa baseada nos últimos três meses, não uma dívida existente.'],
    };
  }
  const l = s.limit;
  if (l.incomeBelowDirect) {
    return {
      headline: 'As entradas cadastradas não cobrem nem os compromissos diretos. Faltam',
      cents: s.directCents - s.incomeCents, tone: 'warning',
      extra: ['Sem outra renda cadastrada, não há limite possível nos cartões sem usar a reserva. O painel não assume que a reserva cobre.'],
    };
  }
  const extra: string[] = [];
  if (l.remainingCents >= 0) extra.push('Já lançado nos cartões cabe no limite.');
  else extra.push('O que já está lançado nos cartões passa desse limite.');
  return { headline: 'Para equilibrar o mês sem usar a reserva, o limite combinado dos cartões seria', cents: l.combinedCents, tone: 'positive', extra };
}

function LimitDetails({ s }: { s: MonthSustainability }) {
  const l = s.limit;
  if (l.incomeBelowDirect) return null;
  return (
    <div className="mt-2 space-y-0.5 text-sm">
      <Row label="Já lançado nos cartões (faturas e fixos)" cents={l.knownCardsCents} />
      <Row label={l.remainingCents >= 0 ? 'Ainda cabe nos cartões' : 'Já passou do limite em'} cents={Math.abs(l.remainingCents)} tone={l.remainingCents >= 0 ? 'positive' : 'negative'} />
      {l.byCard && (
        <div className="pt-1">
          <p className="text-xs text-[var(--text-muted)]">Sugestão por cartão (proporcional à média de cada um):</p>
          {l.byCard.map((c) => <Row key={c.card} label={CARD_FULL_LABELS[c.card]} cents={c.cents} />)}
        </div>
      )}
    </div>
  );
}

function ViewBody({ view, s }: { view: View; s: MonthSustainability }) {
  const v = verdict(view, s);
  return (
    <div>
      <p className="text-sm">{v.headline}</p>
      {v.cents !== null && <div className="mt-1"><Money cents={v.cents} size="xl" tone={v.tone === 'muted' ? 'muted' : v.tone} /></div>}
      {v.extra.map((t) => <p key={t} className="mt-1 text-xs text-[var(--text-muted)]">{t}</p>)}
      {view === 'limit' && <LimitDetails s={s} />}
    </div>
  );
}

function Notices({ s, cash, staleCount }: { s: MonthSustainability; cash: MonthProjection; staleCount: number }) {
  return (
    <>
      {s.noIncomeRegistered && <p className="mt-3 text-xs text-[var(--money-warning)]">Não há entradas cadastradas para este mês. O resultado mostra só o que sai.</p>}
      {staleCount > 0 && s.isCurrent && (
        <p className="mt-3 text-xs text-[var(--money-warning)]">
          {staleCount === 1 ? 'Há uma fatura antiga marcada como não paga. Confira o status em Faturas.' : `Há ${staleCount} faturas antigas marcadas como não pagas. Confira o status em Faturas.`}
        </p>
      )}
      {s.duplicateWarnings.map((w) => <p key={w} className="mt-2 text-xs text-[var(--money-warning)]">{w}</p>)}
      {cash.warnings.filter((w) => !s.duplicateWarnings.includes(w)).map((w) => <p key={w} className="mt-2 text-xs text-[var(--money-warning)]">{w}</p>)}
    </>
  );
}

/** Mês atual: sustentabilidade em três leituras + entradas × saldo × reserva. */
export function CurrentMonthCard({ month, sustainability, balance, balanceInformed, estimate, staleCount = 0 }: {
  month: MonthProjection; sustainability: MonthSustainability; balance: Balance; balanceInformed: boolean; estimate: CardEstimate; staleCount?: number;
}) {
  const s = sustainability;
  const [view, setView] = useState<View>(s.averageResultCents !== null ? 'average' : 'known');
  const limitation = estimateLimitation(estimate);
  return (
    <Card aria-label="Quanto sobra">
      <h2 className="text-sm font-medium text-[var(--text-muted)] capitalize">{monthLabel(s.month)} · sustentabilidade do mês</h2>

      <div role="tablist" aria-label="Leituras do mês" className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-[var(--surface-inset)] p-1">
        {(['known', 'average', 'limit'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`min-h-11 rounded-lg px-1 text-xs font-medium ${view === v ? 'bg-[var(--surface-raised)] text-[var(--foreground)]' : 'text-[var(--text-muted)]'}`}
          >
            {VIEW_LABEL[v]}
          </button>
        ))}
      </div>

      <div className="mt-4" role="tabpanel">
        <ViewBody view={view} s={s} />
      </div>

      <div className="mt-4 space-y-0.5 border-t border-[var(--line)] pt-3 text-sm" aria-label="Entradas, saldo e reserva">
        <Row label="Entradas do mês (só as cadastradas)" cents={s.incomeCents} tone="positive" />
        <Row label="Saldo disponível hoje" cents={balance.availableCents} />
        <Row label="Reserva protegida (nunca entra na conta)" cents={balance.reserveCents} tone="muted" />
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        O resultado depende só das entradas cadastradas. Se a casa tiver outra renda que não está registrada, ela não está aqui, e nenhuma renda é inventada.
        O saldo disponível e a reserva não somam no resultado do mês.
      </p>

      {limitation && view !== 'known' && <p className="mt-2 text-xs text-[var(--text-muted)]">{limitation}</p>}
      {!balanceInformed && <p className="mt-2 text-xs text-[var(--money-warning)]">Você ainda não informou o saldo disponível — o caixa real parte de zero.</p>}
      <Notices s={s} cash={month} staleCount={staleCount} />

      <details className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface-inset)]">
        <summary className="min-h-11 cursor-pointer p-3 text-sm font-medium">Como chegamos a esse valor</summary>
        <div className="border-t border-[var(--line)] p-3">
          <SustainabilityBreakdown s={s} cash={month} estimate={estimate} />
        </div>
      </details>
    </Card>
  );
}

/** Próximos meses (cada um isolado) e, à parte, o caixa real acumulado. */
export function UpcomingMonths({ months, sustainability, estimate }: { months: MonthProjection[]; sustainability: MonthSustainability[]; estimate: CardEstimate }) {
  const limitation = estimateLimitation(estimate);
  const upcoming = sustainability.slice(1);
  return (
    <Card aria-label="Próximos meses">
      <h2 className="text-base font-semibold">Próximos meses</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Cada mês é calculado sozinho: a falta de um mês não passa para o seguinte. A leitura “mantendo a média” é uma hipótese, não uma dívida.
      </p>
      <div className="mt-3 space-y-2">
        {upcoming.map((s) => {
          const cash = months.find((m) => m.month === s.month);
          const usesAverage = s.averageResultCents !== null;
          const shown = usesAverage ? (s.averageResultCents as number) : s.knownResultCents;
          return (
            <details key={s.month} className="rounded-xl border border-[var(--line)] bg-[var(--surface-inset)]">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 p-3.5">
                <span className="text-sm font-medium capitalize">{monthLabel(s.month)}</span>
                <span className="flex items-baseline gap-1.5 text-sm">
                  <span className="text-[var(--text-muted)]">{usesAverage ? 'mantendo a média' : 'conhecido'} · {shown < 0 ? 'falta' : 'sobra'}</span>
                  <Money cents={Math.abs(shown)} size="sm" tone={shown < 0 ? 'warning' : 'positive'} />
                </span>
              </summary>
              <div className="space-y-3 border-t border-[var(--line)] p-3.5">
                {(['known', 'average', 'limit'] as const).map((v) => (
                  <div key={v}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{VIEW_LABEL[v]}</p>
                    <ViewBody view={v} s={s} />
                  </div>
                ))}
                <Notices s={s} cash={cash ?? months[0]} staleCount={0} />
                {cash && <SustainabilityBreakdown s={s} cash={cash} estimate={estimate} />}
              </div>
            </details>
          );
        })}
      </div>

      {limitation && <p className="mt-3 text-xs text-[var(--text-muted)]">{limitation}</p>}

      <details className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-inset)]">
        <summary className="min-h-11 cursor-pointer p-3 text-sm font-medium">Caixa real acumulado (só o que já está registrado)</summary>
        <div className="space-y-1 border-t border-[var(--line)] p-3 text-sm">
          <p className="text-xs text-[var(--text-muted)]">
            Parte do saldo disponível de hoje e soma apenas o que está pendente e registrado: entradas esperadas, contas e faturas ainda não pagas. Não inclui médias nem estimativas, e uma falta real aparece aqui até ser coberta. A reserva não entra.
          </p>
          {months.map((m) => (
            <div key={m.month} className="flex items-baseline justify-between gap-3 py-1">
              <span className="capitalize text-[var(--text-muted)]">Ao fim de {monthLabel(m.month)}</span>
              <Money cents={m.resultCents} size="sm" tone={m.resultCents < 0 ? 'negative' : 'default'} />
            </div>
          ))}
        </div>
      </details>
    </Card>
  );
}

'use client';

import { useState } from 'react';
import { HISTORY_INVOICES, type CardEstimate } from '@/modules/finance/cash/domain/card-estimate';
import { averageUnavailableReason, type MonthSustainability, type SustainabilityCardRow } from '@/modules/finance/cash/domain/sustainability';
import type { MonthEntry, MonthView } from '@/modules/finance/cash/domain/month-view';
import { CARD_FULL_LABELS, monthShortLabel } from '@/modules/finance/cash/domain/month';
import type { Balance } from '@/modules/finance/cash/domain/types';
import { Card, Chip, Money } from './ui';
import { SplitBar, titleMonth } from './month-parts';

/**
 * Resumo e sustentabilidade do MÊS ESCOLHIDO.
 *
 * Dois conceitos que nunca se misturam:
 *  - Resultado do mês inteiro: tudo o que pertence ao mês (recebido e previsto,
 *    pago e pendente). Mês encerrado mostra só o que os registros afirmam.
 *  - Caixa restante: saldo informado hoje + o que ainda está pendente (só do mês
 *    atual em diante). O que já foi pago/recebido não é movimentado de novo e a
 *    reserva protegida nunca entra.
 *
 * Três leituras (do mês atual em diante): conhecido, mantendo a média (hipótese)
 * e meta sem a reserva (limite combinado dos cartões — nunca dividido por pessoa).
 */

type SustainView = 'known' | 'average' | 'limit';
const VIEW_LABEL: Record<SustainView, string> = { known: 'Conhecido', average: 'Mantendo a média', limit: 'Meta sem a reserva' };

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

const COMPLETENESS: Record<MonthView['completeness'], { text: string; tone: 'positive' | 'info' | 'warning' | 'neutral' }> = {
  closed: { text: 'Mês encerrado · faturas fechadas ou pagas', tone: 'positive' },
  incomplete: { text: 'Mês anterior · há fatura aberta ou sem lançamento', tone: 'warning' },
  in_progress: { text: 'Mês em andamento', tone: 'info' },
  partial: { text: 'Mês futuro · só o que já está cadastrado', tone: 'neutral' },
};

/* ------------------------------------------------------------------ */
/* Resumo do mês                                                       */
/* ------------------------------------------------------------------ */

export function MonthSummaryCard({ view, balance }: { view: MonthView; balance: Balance }) {
  const balanceInformed = balance.availableUpdatedAt !== null;
  const s = view.sustainability;
  const known = s.knownResultCents;
  const receivedCents = s.incomeLines.filter((l) => l.done).reduce((t, l) => t + l.amountCents, 0);
  const directPaidCents = s.directLines.filter((l) => l.done).reduce((t, l) => t + l.amountCents, 0);
  const invoicesPaidCents = s.cards.filter((c) => c.invoiceStatus === 'paid').reduce((t, c) => t + c.invoiceCents, 0);
  const c = COMPLETENESS[view.completeness];
  const cash = view.cash;

  return (
    <Card aria-label="Resumo do mês">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-[var(--text-muted)]">Resultado do mês inteiro</h2>
        <Chip tone={c.tone}>{c.text}</Chip>
      </div>

      <p className="mt-3 text-sm">
        {known >= 0 ? 'Com o que está cadastrado, o mês fecha com sobra de' : 'Com o que está cadastrado, os compromissos ultrapassam as entradas em'}
      </p>
      <div className="mt-1">
        <Money cents={Math.abs(known)} size="xl" tone={known >= 0 ? 'positive' : 'warning'} />
      </div>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Entradas cadastradas − compromissos − faturas, contando também o que já foi pago ou recebido neste mês.
        {view.phase === 'future' && ' Um mês futuro nunca está completamente conhecido.'}
      </p>

      <div className="mt-4 space-y-4" aria-label="Composição do mês">
        <SplitBar
          label="Entradas do mês" tone="positive" totalCents={s.incomeCents} doneCents={receivedCents}
          doneLabel="recebido" pendingLabel="a receber"
        />
        <SplitBar
          label="Compromissos" totalCents={s.directCents} doneCents={directPaidCents}
          doneLabel="pago" pendingLabel="pendente"
        />
        <SplitBar
          label="Faturas dos cartões" totalCents={s.invoicesCents} doneCents={invoicesPaidCents}
          doneLabel="paga" pendingLabel="a pagar"
        />
        {s.cardFixedCents > 0 && (
          <p className="text-xs text-[var(--text-muted)]">
            + <Money cents={s.cardFixedCents} size="sm" tone="muted" /> em gastos fixos no cartão que ainda não aparecem em fatura.
          </p>
        )}
      </div>

      {s.hypothesisAllowed && s.averageResultCents !== null && (
        <div className="mt-4 rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--surface-inset)] p-3 text-sm">
          <p className="flex items-center gap-2"><Chip tone="neutral">Hipótese</Chip> <span className="text-[var(--text-muted)]">Mantendo a média dos cartões</span></p>
          <p className="mt-1">
            {s.averageResultCents >= 0 ? 'o mês fecharia com sobra de ' : 'faltariam '}
            <Money cents={Math.abs(s.averageResultCents)} size="sm" tone={s.averageResultCents >= 0 ? 'positive' : 'warning'} />
            <span className="text-xs text-[var(--text-muted)]"> · estimativa, não é dívida existente</span>
          </p>
        </div>
      )}

      <div className="mt-5 border-t border-[var(--line)] pt-4" aria-label="Caixa restante">
        <h3 className="text-sm font-medium text-[var(--text-muted)]">Caixa restante</h3>
        {cash ? (
          <div className="mt-1 text-sm">
            <Row label={cash.kind === 'current' ? 'Saldo disponível informado hoje' : 'Caixa esperado ao começar o mês'} cents={cash.openingCents} tone={cash.openingCents < 0 ? 'negative' : 'default'} />
            <Row label="Entradas ainda pendentes de recebimento" cents={cash.pendingInflowCents} sign="+" tone="positive" />
            <Row label="Compromissos e faturas ainda não pagos" cents={cash.pendingOutflowCents} sign="−" />
            <Row label={cash.kind === 'current' ? 'Saldo esperado depois dessas movimentações' : 'Caixa esperado ao fim do mês'} cents={cash.expectedCents} tone={cash.expectedCents < 0 ? 'negative' : 'default'} strong />
            <Row label="Reserva protegida (fora desta conta)" cents={balance.reserveCents} tone="muted" />
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Só entra o que ainda não foi pago ou recebido — o que já passou não é movimentado de novo sobre o saldo.
              A reserva protegida nunca entra.{cash.kind === 'future' && ' Para meses futuros, este caixa acumula só o que está registrado e fica separado da sustentabilidade do mês.'}
            </p>
            {!balanceInformed && <p className="mt-2 text-xs text-[var(--money-warning)]">Você ainda não informou o saldo disponível — o caixa parte de zero.</p>}
            {view.staleInvoices.length > 0 && view.phase === 'current' && (
              <p className="mt-2 text-xs text-[var(--money-warning)]">
                {view.staleInvoices.length === 1 ? 'Há uma fatura antiga marcada como não paga. Confira o status em Faturas.' : `Há ${view.staleInvoices.length} faturas antigas marcadas como não pagas. Confira o status em Faturas.`}
              </p>
            )}
            {cash.warnings.map((w) => <p key={w} className="mt-2 text-xs text-[var(--money-warning)]">{w}</p>)}
          </div>
        ) : (
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Mês encerrado: mostramos só o que os registros permitem afirmar. Não reconstruímos o saldo bancário daquela época com o saldo informado hoje.
          </p>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Sustentabilidade                                                    */
/* ------------------------------------------------------------------ */

function cardRowText(r: SustainabilityCardRow): string {
  const label = CARD_FULL_LABELS[r.card];
  switch (r.kind) {
    case 'real':
      return `${label}: fatura ${r.invoiceStatus === 'paid' ? 'paga' : 'fechada'} — vale o valor real; a média não entra.`;
    case 'partial':
      return `${label}: fatura aberta (parcial). Vale o que já está lançado${r.averageCents !== null ? '; só a diferença até a média é estimada' : ''}.`;
    case 'average':
      return `${label}: ainda sem fatura. Vale a média${r.cardFixedCents > 0 ? ' menos os gastos fixos já conhecidos' : ''}.`;
    default:
      return `${label}: sem fatura fechada e sem média confiável — nada foi estimado.`;
  }
}

/** "Como chegamos a esse valor": cada parcela, médias usadas e o que ficou de fora para não contar em dobro. */
export function SustainabilityBreakdown({ s, estimate, reconciled }: { s: MonthSustainability; estimate: CardEstimate; reconciled: MonthEntry[] }) {
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
        {s.hypothesisAllowed && estimate.byCard.map((c) => (
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
        {s.hypothesisAllowed && <Row label="Limite combinado dos cartões" cents={s.limit.combinedCents} tone="muted" />}
        <p className="mt-1 text-xs text-[var(--text-muted)]">Nada é levado para o mês seguinte. A reserva não é usada.</p>
      </section>

      {reconciled.length > 0 && (
        <section aria-label="Não contado em dobro">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Não contado em dobro</h4>
          {reconciled.map((l) => (
            <p key={`${l.id}-${l.card}`} className="text-xs text-[var(--text-muted)]">
              {l.label} ({l.card ? CARD_FULL_LABELS[l.card] : 'cartão'}) já está dentro da fatura; não foi somado de novo.
            </p>
          ))}
        </section>
      )}
      <p className="text-xs text-[var(--text-muted)]">
        Parcelas já lançadas nas faturas estão dentro dos valores das faturas. Faturas pagas e compromissos pagos contam no mês, mas não aparecem como pendência. Gastos fora do cartão ainda não registrados não estão incluídos.
      </p>
    </div>
  );
}

function verdict(view: SustainView, s: MonthSustainability): { headline: string; cents: number | null; tone: 'positive' | 'warning' | 'muted'; extra: string[] } {
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
  return {
    headline: 'Para equilibrar o mês sem usar a reserva, o limite combinado dos cartões seria',
    cents: l.combinedCents, tone: 'positive',
    extra: [l.remainingCents >= 0 ? 'O que já está lançado nos cartões cabe nesse limite.' : 'O que já está lançado nos cartões passa desse limite.'],
  };
}

function LimitDetails({ s }: { s: MonthSustainability }) {
  const l = s.limit;
  if (l.incomeBelowDirect) return null;
  return (
    <div className="mt-2 space-y-0.5 text-sm">
      <Row label="Já lançado nos cartões (faturas e fixos)" cents={l.knownCardsCents} />
      <Row label={l.remainingCents >= 0 ? 'Ainda cabe nos cartões' : 'Já passou do limite em'} cents={Math.abs(l.remainingCents)} tone={l.remainingCents >= 0 ? 'positive' : 'negative'} />
      <p className="text-xs text-[var(--text-muted)]">Um limite só, da casa: não é dividido entre Lucas e Matheus.</p>
    </div>
  );
}

function ViewBody({ view, s }: { view: SustainView; s: MonthSustainability }) {
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

/** Sustentabilidade do mês escolhido: três leituras (hipóteses só do mês atual em diante). */
export function SustainabilityCard({ view }: { view: MonthView }) {
  const s = view.sustainability;
  const [picked, setPicked] = useState<SustainView | null>(null);
  const available: SustainView[] = s.hypothesisAllowed ? ['known', 'average', 'limit'] : ['known'];
  const active: SustainView = picked && available.includes(picked) ? picked : s.averageResultCents !== null ? 'average' : 'known';
  const limitation = view.estimate.insufficientCards.length > 0 ? estimateLimitation(view.estimate) : null;

  return (
    <Card aria-label="Sustentabilidade do mês">
      <h2 className="text-sm font-medium text-[var(--text-muted)]">Sustentabilidade · {titleMonth(s.month)}</h2>

      {s.hypothesisAllowed ? (
        <div role="tablist" aria-label="Leituras do mês" className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-[var(--surface-inset)] p-1">
          {available.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={active === v}
              onClick={() => setPicked(v)}
              className={`min-h-11 rounded-lg px-1 text-xs font-medium ${active === v ? 'bg-[var(--surface-raised)] text-[var(--foreground)]' : 'text-[var(--text-muted)]'}`}
            >
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-[var(--text-muted)]">Mês encerrado: só o que os registros mostram — sem médias nem metas hipotéticas.</p>
      )}

      <div className="mt-4" role={s.hypothesisAllowed ? 'tabpanel' : undefined}>
        <ViewBody view={active} s={s} />
      </div>

      <div className="mt-4 space-y-0.5 border-t border-[var(--line)] pt-3 text-sm" aria-label="Entradas, saldo e reserva">
        <Row label="Entradas do mês (só as cadastradas)" cents={s.incomeCents} tone="positive" />
        <p className="text-xs text-[var(--text-muted)]">O saldo disponível e a reserva protegida ficam fora deste cálculo: o mês depende só das entradas cadastradas.</p>
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        O resultado depende só das entradas cadastradas. Se a casa tiver outra renda que não está registrada, ela não está aqui, e nenhuma renda é inventada.
      </p>

      {limitation && s.hypothesisAllowed && active !== 'known' && <p className="mt-2 text-xs text-[var(--text-muted)]">{limitation}</p>}
      {s.noIncomeRegistered && <p className="mt-3 text-xs text-[var(--money-warning)]">Não há entradas cadastradas para este mês. O resultado mostra só o que sai.</p>}
      {s.duplicateWarnings.map((w) => <p key={w} className="mt-2 text-xs text-[var(--money-warning)]">{w}</p>)}

      <details className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface-inset)]">
        <summary className="min-h-11 cursor-pointer p-3 text-sm font-medium">Como chegamos a esse valor</summary>
        <div className="border-t border-[var(--line)] p-3">
          <SustainabilityBreakdown s={s} estimate={view.estimate} reconciled={view.commitmentsCard.filter((e) => !e.carriedOver && e.cardState !== undefined && e.cardState !== 'awaiting_invoice')} />
        </div>
      </details>

      {view.cashTimeline.length > 0 && (
        <details className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface-inset)]">
          <summary className="min-h-11 cursor-pointer p-3 text-sm font-medium">Caixa real acumulado (só o que já está registrado)</summary>
          <div className="space-y-1 border-t border-[var(--line)] p-3 text-sm">
            <p className="text-xs text-[var(--text-muted)]">
              Parte do saldo disponível de hoje e soma apenas o que está pendente e registrado: entradas esperadas, contas e faturas ainda não pagas. Não inclui médias nem estimativas; uma falta real aparece aqui até ser coberta. A reserva não entra.
            </p>
            {view.cashTimeline.map((m) => (
              <div key={m.month} className="flex items-baseline justify-between gap-3 py-1">
                <span className="text-[var(--text-muted)]">Ao fim de {titleMonth(m.month)}</span>
                <Money cents={m.resultCents} size="sm" tone={m.resultCents < 0 ? 'negative' : 'default'} />
              </div>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}


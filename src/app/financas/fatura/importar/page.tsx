'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, FileUp } from 'lucide-react';
import { useCommands, useRepositories } from '@/providers/repository.provider';
import { CARD_IDS, CARD_FULL_LABELS, isMonthKey, monthLabel, type CardId } from '@/modules/finance/cash/domain/month';
import type { ConfirmPayload, ConfirmResult, ImportPreview, PreviewItem } from '@/modules/finance/cash/domain/import-preview';
import type { DivergenceDecision, MissingDecision } from '@/modules/finance/cash/domain/import-plan';
import {
  Card, Chip, ErrorText, Eyebrow, Field, Money, buttonPrimary, buttonSecondary, formatDateBR, formatDateTimeBR, inputClass,
} from '@/components/finance-cash/ui';
import { todayDateStr } from '@/lib/dates';

type Step = 'form' | 'review' | 'done';

function ItemLine({ item }: { item: PreviewItem }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="min-w-0 truncate">
        <span className="text-[var(--text-muted)]">{formatDateBR(item.date)}</span> {item.description}
        {item.kind === 'payment' && <Chip tone="info">pagamento</Chip>}
        {item.kind === 'refund' && <Chip tone="neutral">estorno</Chip>}
      </span>
      <Money cents={item.amountCents} size="sm" tone={item.amountCents < 0 ? 'positive' : 'default'} />
    </li>
  );
}

function ImportFlow() {
  const params = useSearchParams();
  const { financeCashRepository } = useRepositories();
  const { financeCash } = useCommands();
  const initialCard = CARD_IDS.find((c) => c === params.get('card')) ?? 'nubank_1';
  const initialMonthParam = params.get('month');
  const [card, setCard] = useState<CardId>(initialCard);
  const [month, setMonth] = useState(initialMonthParam && isMonthKey(initialMonthParam) ? initialMonthParam : todayDateStr().slice(0, 7));
  const [monthFromName, setMonthFromName] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [divergences, setDivergences] = useState<Record<string, DivergenceDecision>>({});
  const [missing, setMissing] = useState<Record<string, MissingDecision>>({});
  const [links, setLinks] = useState<Record<string, boolean>>({});
  const [pay, setPay] = useState<Record<string, boolean>>({});
  // 'paid' = fatura histórica já quitada: entra no histórico e nas médias, sem mexer no saldo.
  const [newStatus, setNewStatus] = useState<'open' | 'closed' | 'paid'>('open');
  const [dueDate, setDueDate] = useState('');
  const [paidOn, setPaidOn] = useState(() => todayDateStr());
  const [result, setResult] = useState<ConfirmResult | null>(null);

  function upload(url: string, extra?: ConfirmPayload) {
    const form = new FormData();
    form.set('file', file as File);
    form.set('card', card);
    form.set('month', month);
    if (extra) form.set('payload', JSON.stringify(extra));
    return fetch(url, { method: 'POST', body: form });
  }

  async function onPreview() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await upload('/api/finance/cash/import/preview');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Não foi possível ler o arquivo.');
      const p = body.preview as ImportPreview;
      setPreview(p);
      setRequestId(crypto.randomUUID());
      setDivergences({});
      setMissing({});
      setLinks(Object.fromEntries(p.linkSuggestions.map((s) => [s.ref, s.confidence === 'high'])));
      setPay(Object.fromEntries(p.paymentMatches.map((m) => [m.invoiceId, true])));
      setNewStatus(p.invoice.status === 'closed' ? 'closed' : 'open');
      setDueDate(p.suggestedDueDate && p.suggestedDueDate.startsWith(month) ? p.suggestedDueDate : '');
      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao ler o arquivo.');
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const payload: ConfirmPayload = {
        requestId,
        expectedRev: preview.invoice.rev,
        // O servidor só conhece aberta/fechada: "paga" é fechada + marcação de pagamento sem descontar do saldo.
        newStatus: newStatus === 'paid' ? 'closed' : newStatus,
        dueDate: dueDate || null,
        decisions: { divergences, missing },
        links: preview.linkSuggestions.filter((s) => links[s.ref]).map((s) => ({ ref: s.ref, commitmentId: s.commitmentId })),
        payInvoiceIds: preview.paymentMatches.filter((m) => pay[m.invoiceId]).map((m) => m.invoiceId),
      };
      const res = await upload('/api/finance/cash/import/confirm', payload);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Não foi possível salvar a importação.');
      const confirmed = body.result as ConfirmResult;
      if (newStatus === 'paid') {
        // Histórico quitado: não desconta do saldo disponível nem entra na projeção.
        await financeCash.changeInvoiceStatus(confirmed.invoiceId, 'paid', { paidOn, deductFromBalance: false });
      }
      setResult(confirmed);
      financeCashRepository.notifyChanged();
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar a importação.');
    } finally {
      setBusy(false);
    }
  }

  const undecided = preview ? preview.divergences.filter((d) => !divergences[d.key]).length : 0;
  const canConfirm = Boolean(preview) && preview!.parseErrors.length === 0 && undecided === 0 && preview!.invoice.status !== 'paid' && !busy;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-24 md:p-8">
      <Link href="/financas" className="inline-flex items-center gap-1 text-sm text-[var(--accent)]"><ArrowLeft size={14} /> Finanças</Link>
      <h1 className="text-2xl font-bold">Importar fatura</h1>

      {step === 'form' && (
        <Card>
          <div className="space-y-4">
            <Field label="Cartão">
              {(id) => (
                <select id={id} className={inputClass} value={card} onChange={(e) => setCard(e.target.value as CardId)}>
                  {CARD_IDS.map((c) => <option key={c} value={c}>{CARD_FULL_LABELS[c]}</option>)}
                </select>
              )}
            </Field>
            <Field label="Mês de vencimento da fatura" hint={monthFromName ? 'Sugerido pelo nome do arquivo — confirme se está certo.' : 'O mês é escolhido por você; as datas das compras não definem a fatura.'}>
              {(id) => <input id={id} type="month" className={inputClass} value={month} onChange={(e) => { setMonth(e.target.value); setMonthFromName(false); }} required />}
            </Field>
            <Field label="Arquivo CSV da fatura Nubank" hint="Pode enviar de novo uma fatura aberta mais recente: o que já existe é reconhecido, não duplicado.">
              {(id) => (
                <input
                  id={id}
                  type="file"
                  accept=".csv,text/csv"
                  className={inputClass}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setFile(f);
                    const m = f?.name.match(/(\d{4})-(\d{2})-\d{2}/);
                    if (m && isMonthKey(`${m[1]}-${m[2]}`)) {
                      setMonth(`${m[1]}-${m[2]}`);
                      setMonthFromName(true);
                    }
                  }}
                />
              )}
            </Field>
            <ErrorText message={error} />
            <button type="button" className={buttonPrimary} disabled={!file || busy || !isMonthKey(month)} onClick={() => void onPreview()}>
              <FileUp size={15} /> {busy ? 'Lendo…' : 'Pré-visualizar'}
            </button>
          </div>
        </Card>
      )}

      {step === 'review' && preview && (
        <>
          <Card>
            <Eyebrow>{CARD_FULL_LABELS[preview.card]} · vencimento em {monthLabel(preview.month)}</Eyebrow>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Confira: este arquivo vai para a fatura do cartão <strong>{CARD_FULL_LABELS[preview.card]}</strong> de {monthLabel(preview.month)}. Se não for esse, volte e corrija.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <Stat label="Novos" value={preview.counts.new} />
              <Stat label="Já reconhecidos" value={preview.counts.recognized} />
              <Stat label="Alterados" value={preview.counts.divergences} warn={preview.counts.divergences > 0} />
              <Stat label="Ausentes do arquivo" value={preview.counts.missing} warn={preview.counts.missing > 0} />
            </div>
            <div className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-[var(--text-muted)]">Valor da fatura hoje</span>
                {preview.invoice.amountBeforeCents !== null ? <Money cents={preview.invoice.amountBeforeCents} size="sm" /> : <span className="text-[var(--text-muted)]">sem importação anterior</span>}</div>
              <div className="flex justify-between"><span className="text-[var(--text-muted)]">Valor da fatura depois</span><Money cents={preview.amountAfterCents} size="sm" /></div>
              {preview.paymentsInFileCents > 0 && (
                <div className="flex justify-between"><span className="text-[var(--text-muted)]">Pagamento da fatura anterior no arquivo (não é compra)</span><Money cents={preview.paymentsInFileCents} size="sm" tone="muted" /></div>
              )}
            </div>
            {preview.invoice.lastImportedAt && (
              <p className="mt-2 text-xs text-[var(--text-muted)]">Última importação desta fatura: {formatDateTimeBR(preview.invoice.lastImportedAt)}.</p>
            )}
            {preview.noChanges && <p className="mt-3 rounded-lg bg-[var(--surface-inset)] p-3 text-sm">Nada novo: este arquivo já está refletido na fatura. Confirmar não altera os valores.</p>}
            {preview.invoice.status === 'paid' && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">Esta fatura está marcada como paga. Para reimportar, mude a situação em Finanças › Faturas › Situação (nada é apagado). A importação nunca altera uma fatura paga.</p>}
          </Card>

          {preview.parseErrors.length > 0 && (
            <Card>
              <Eyebrow>Linhas com problema</Eyebrow>
              <ul className="mt-2 list-inside list-disc text-sm text-[var(--money-negative)]">
                {preview.parseErrors.slice(0, 10).map((e) => <li key={e.line}>Linha {e.line}: {e.message}</li>)}
              </ul>
              <p className="mt-2 text-xs text-[var(--text-muted)]">Corrija o arquivo e envie de novo. Nada foi salvo.</p>
            </Card>
          )}

          {preview.divergences.length > 0 && (
            <Card>
              <Eyebrow>Precisa da sua decisão ({undecided} pendente{undecided === 1 ? '' : 's'})</Eyebrow>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Mesmo estabelecimento, mas data ou valor mudou. Nada é descartado sem você decidir.</p>
              <ul className="mt-3 space-y-3">
                {preview.divergences.map((d) => (
                  <li key={d.key} className="rounded-xl border border-[var(--line)] bg-[var(--surface-inset)] p-3">
                    <p className="text-xs text-[var(--text-muted)]">Antes</p><ul><ItemLine item={d.existing} /></ul>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">Agora no arquivo</p><ul><ItemLine item={d.incoming} /></ul>
                    <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Decisão">
                      <ChoiceButton active={divergences[d.key] === 'same'} onClick={() => setDivergences({ ...divergences, [d.key]: 'same' })}>É o mesmo lançamento (atualizar)</ChoiceButton>
                      <ChoiceButton active={divergences[d.key] === 'different'} onClick={() => setDivergences({ ...divergences, [d.key]: 'different' })}>São lançamentos diferentes (manter os dois)</ChoiceButton>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {preview.missing.length > 0 && (
            <Card>
              <Eyebrow>Estavam na fatura e não vieram neste arquivo</Eyebrow>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Por padrão continuam contando, marcados para revisão. Remova só se tiver certeza (ex.: estorno ou cancelamento).</p>
              <ul className="mt-2 divide-y divide-[var(--line)]">
                {preview.missing.map((m) => (
                  <li key={m.id} className="py-2">
                    <ul><ItemLine item={m.item} /></ul>
                    <div className="mt-1 flex gap-2">
                      <ChoiceButton active={(missing[m.id] ?? 'keep') === 'keep'} onClick={() => setMissing({ ...missing, [m.id]: 'keep' })}>Manter</ChoiceButton>
                      <ChoiceButton active={missing[m.id] === 'remove'} onClick={() => setMissing({ ...missing, [m.id]: 'remove' })}>Remover</ChoiceButton>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {preview.paymentMatches.length > 0 && (
            <Card>
              <Eyebrow>Pagamento da fatura anterior</Eyebrow>
              {preview.paymentMatches.map((m) => (
                <label key={m.invoiceId} className="mt-2 flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={pay[m.invoiceId] ?? false} onChange={(e) => setPay({ ...pay, [m.invoiceId]: e.target.checked })} />
                  <span>
                    “{m.description}” de <Money cents={Math.abs(m.amountCents)} size="sm" /> corresponde a {m.invoiceLabel}. Marcar essa fatura como paga?
                    <span className="block text-xs text-[var(--text-muted)]">Não altera seu saldo: o pagamento já aconteceu.</span>
                  </span>
                </label>
              ))}
            </Card>
          )}

          {preview.linkSuggestions.length > 0 && (
            <Card>
              <Eyebrow>Gastos fixos encontrados na fatura</Eyebrow>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Vinculados, não são somados de novo: o total a pagar considera só a fatura.</p>
              <ul className="mt-2 space-y-2">
                {preview.linkSuggestions.map((s) => (
                  <li key={s.ref}>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-1" checked={links[s.ref] ?? false} onChange={(e) => setLinks({ ...links, [s.ref]: e.target.checked })} />
                      <span>
                        {s.item.description} (<Money cents={s.item.amountCents} size="sm" />) ↔ {s.commitmentDescription}
                        <span className="ml-1"><Chip tone={s.confidence === 'high' ? 'positive' : 'warning'}>{s.confidence === 'high' ? 'nome e valor batem' : s.reason === 'name_only' ? 'só o nome parece igual' : 'só o valor é igual'}</Chip></span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {preview.newItems.length > 0 && (
            <Card>
              <details>
                <summary className="cursor-pointer text-sm font-medium">Ver {preview.newItems.length} lançamento{preview.newItems.length === 1 ? '' : 's'} novo{preview.newItems.length === 1 ? '' : 's'}</summary>
                <ul className="mt-2 divide-y divide-[var(--line)]">{preview.newItems.map((i, idx) => <ItemLine key={idx} item={i} />)}</ul>
              </details>
            </Card>
          )}

          <Card>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Situação da fatura depois da importação">
                {(id) => (
                  <select id={id} className={inputClass} value={newStatus} onChange={(e) => setNewStatus(e.target.value as 'open' | 'closed' | 'paid')}>
                    <option value="open">Aberta (pode receber nova versão)</option>
                    <option value="closed">Fechada, ainda não paga</option>
                    <option value="paid">Já paga (histórico)</option>
                  </select>
                )}
              </Field>
              {newStatus === 'paid' && (
                <Field label="Data do pagamento">{(id) => <input id={id} type="date" className={inputClass} value={paidOn} max={todayDateStr()} onChange={(e) => setPaidOn(e.target.value)} />}</Field>
              )}
              {newStatus === 'paid' && (
                <p className="text-sm text-[var(--text-muted)] md:col-span-2">
                  Entra no histórico de gastos, nas categorias e na média do cartão. Não gera dívida, não desconta do saldo disponível e não entra nas pendências. Você pode corrigir depois em Faturas › Situação.
                </p>
              )}
              <Field label="Vencimento (opcional)">{(id) => <input id={id} type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}</Field>
            </div>
            <ErrorText message={error} />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={buttonSecondary} onClick={() => { setStep('form'); setError(null); }}>Voltar</button>
              <button type="button" className={buttonPrimary} disabled={!canConfirm} onClick={() => void onConfirm()}>
                {busy ? 'Salvando…' : undecided > 0 ? `Decida ${undecided} item(ns) para confirmar` : 'Confirmar importação'}
              </button>
            </div>
          </Card>
        </>
      )}

      {step === 'done' && result && (
        <Card>
          <Eyebrow>Importação concluída</Eyebrow>
          <p className="mt-2 text-sm">
            {result.alreadyApplied ? 'Esta importação já havia sido aplicada — nada foi duplicado.' : (
              <>Novos: {result.counts.new} · reconhecidos: {result.counts.recognized} · atualizados: {result.counts.changed} · ausentes/removidos: {result.counts.missing}.</>
            )}
          </p>
          <div className="mt-4 flex gap-2">
            <Link href={`/financas/fatura/${result.invoiceId}`} className={buttonPrimary}>Ver lançamentos</Link>
            <Link href="/financas" className={buttonSecondary}>Voltar a Finanças</Link>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-[var(--surface-inset)] p-2.5">
      <p className={`tabular text-xl font-semibold ${warn ? 'text-[var(--money-warning)]' : ''}`}>{value}</p>
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

function ChoiceButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${active ? 'border-[var(--accent)] bg-blue-50 text-blue-800' : 'border-[var(--line-strong)] text-[var(--foreground)]'}`}
    >
      {children}
    </button>
  );
}

export default function ImportarFaturaPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-[var(--text-muted)]">Carregando…</p>}>
      <ImportFlow />
    </Suspense>
  );
}

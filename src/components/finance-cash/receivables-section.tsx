'use client';

import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { useCommands } from '@/providers/repository.provider';
import type { FixedIncome, IncomeOccurrence, Receivable } from '@/modules/finance/cash/domain/types';
import type { IncomeMonthRow } from '@/modules/finance/cash/domain/projection';
import type { MonthEntry, MonthView } from '@/modules/finance/cash/domain/month-view';
import { monthLabel, type MonthKey } from '@/modules/finance/cash/domain/month';
import { SplitBar } from './month-parts';
import {
  Card, Chip, Dialog, EndMonthField, ErrorText, Eyebrow, Field, Money, MoneyField, buttonGhost, buttonPrimary, buttonSecondary,
  formatDateBR, inputClass, parseMoneyInput, centsToInput, useAction,
} from './ui';

/* ------------------------------------------------------------------ */
/* Recebimentos pontuais                                               */
/* ------------------------------------------------------------------ */

export function ReceivableForm({ initial, onDone, onCancel }: { initial?: Receivable; onDone: () => void; onCancel: () => void }) {
  const { financeCash } = useCommands();
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState(initial ? centsToInput(initial.amountCents) : '');
  const [date, setDate] = useState(initial?.expectedDate ?? '');
  const [status, setStatus] = useState<'confirmed' | 'uncertain'>(initial && initial.status === 'uncertain' ? 'uncertain' : 'confirmed');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const { pending, error, run } = useAction();
  const cents = parseMoneyInput(amount);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (cents === null) return;
        const input = { description, amountCents: cents, expectedDate: date, status, notes: notes || undefined };
        const ok = await run(async () => {
          if (initial) await financeCash.updateReceivable(initial.id, input, initial.updatedAt);
          else await financeCash.createReceivable(input);
        });
        if (ok) onDone();
      }}
    >
      <Field label="Descrição">{(id) => <input id={id} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={200} />}</Field>
      <MoneyField label="Valor" value={amount} onChange={setAmount} />
      <Field label="Data prevista">{(id) => <input id={id} type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} required />}</Field>
      <Field label="Certeza" hint="Só recebimentos confirmados entram na projeção principal.">
        {(id) => (
          <select id={id} className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as 'confirmed' | 'uncertain')}>
            <option value="confirmed">Confirmado</option>
            <option value="uncertain">Incerto</option>
          </select>
        )}
      </Field>
      <Field label="Observações (opcional)">{(id) => <textarea id={id} className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />}</Field>
      <ErrorText message={error} />
      <div className="flex justify-end gap-2">
        <button type="button" className={buttonSecondary} onClick={onCancel}>Cancelar</button>
        <button type="submit" className={buttonPrimary} disabled={pending || cents === null || cents <= 0 || !description.trim() || !date}>
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}

function OneOffBlock({ receivables, view, showAdd }: { receivables: Receivable[]; view: MonthView; showAdd: boolean }) {
  const { financeCash } = useCommands();
  const [form, setForm] = useState<null | { initial?: Receivable }>(null);
  const [receiving, setReceiving] = useState<Receivable | null>(null);
  const [addToBalance, setAddToBalance] = useState(true);
  const { pending, error, run, clearError } = useAction();

  const byId = new Map(receivables.map((r) => [r.id, r]));
  const entries = [...view.incomeOneOff].sort((a, b) => Number(a.state === 'done') - Number(b.state === 'done') || (a.date ?? '').localeCompare(b.date ?? ''));
  const own = entries.filter((e) => !e.carriedOver);
  const confirmedCents = own.filter((e) => !e.uncertain).reduce((t, e) => t + e.amountCents, 0);
  const uncertainCents = own.filter((e) => e.uncertain).reduce((t, e) => t + e.amountCents, 0);

  const row = (e: MonthEntry) => {
    const r = byId.get(e.id);
    const done = e.state === 'done';
    return (
      <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
        <div className="min-w-0">
          <p className={`truncate text-sm ${done ? 'text-[var(--text-muted)]' : ''}`}>{e.label}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
            {e.date ? formatDateBR(e.date) : ''}
            {done && <Chip tone="positive">Recebido</Chip>}
            {e.uncertain && <Chip tone="warning">Incerto</Chip>}
            {e.overdue && <Chip tone="negative">Atrasado</Chip>}
            {e.carriedOver && <span>de {monthLabel(e.month)} · fora do resultado deste mês</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Money cents={e.amountCents} tone={done || e.uncertain ? 'muted' : 'positive'} />
          {!done && r && (
            <>
              <button type="button" className={buttonGhost} onClick={() => { clearError(); setAddToBalance(true); setReceiving(r); }} aria-label={`Marcar ${e.label} como recebido`}>
                <Check size={14} /> Recebi
              </button>
              <button type="button" className={buttonGhost} onClick={() => setForm({ initial: r })}>Editar</button>
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Recebimentos pontuais</h3>
          <p className="text-xs text-[var(--text-muted)]">Valores confirmados ou incertos, um a um.</p>
        </div>
        {showAdd && <button type="button" className={buttonGhost} onClick={() => setForm({})}><Plus size={14} /> Adicionar</button>}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <Money cents={confirmedCents} size="md" tone="positive" />
        {uncertainCents > 0 && (
          <span className="text-xs text-[var(--text-muted)]">+ <Money cents={uncertainCents} size="sm" tone="muted" /> incertos (fora da conta)</span>
        )}
      </div>
      {entries.length > 0 ? (
        <details className="mt-2" open={entries.length <= 4}>
          <summary className="cursor-pointer text-xs font-medium text-[var(--accent)]">Ver recebimentos pontuais</summary>
          <ul className="mt-2 divide-y divide-[var(--line)]">{entries.map(row)}</ul>
        </details>
      ) : (
        <p className="mt-2 text-xs text-[var(--text-muted)]">Nenhum recebimento pontual neste mês.</p>
      )}

      <Dialog open={form !== null} title={form?.initial ? 'Editar recebimento' : 'Novo recebimento'} onClose={() => setForm(null)}>
        {form && <ReceivableForm initial={form.initial} onDone={() => setForm(null)} onCancel={() => setForm(null)} />}
      </Dialog>

      <Dialog open={receiving !== null} title="Marcar como recebido" onClose={() => setReceiving(null)}>
        {receiving && (
          <div className="space-y-4">
            <p className="text-sm">{receiving.description} — <Money cents={receiving.amountCents} size="sm" /></p>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={addToBalance} onChange={(e) => setAddToBalance(e.target.checked)} />
              <span>
                Somar ao saldo disponível
                <span className="block text-xs text-[var(--text-muted)]">
                  Desmarque se você já atualizou o saldo depois de receber — assim o valor não é contado duas vezes.
                </span>
              </span>
            </label>
            <ErrorText message={error} />
            <div className="flex justify-end gap-2">
              <button type="button" className={buttonSecondary} onClick={async () => {
                if (await run(() => financeCash.cancelReceivable(receiving.id))) setReceiving(null);
              }} disabled={pending}>Cancelar recebimento</button>
              <button type="button" className={buttonPrimary} disabled={pending} onClick={async () => {
                if (await run(() => financeCash.markReceived(receiving.id, addToBalance))) setReceiving(null);
              }}>{pending ? 'Salvando…' : 'Confirmar'}</button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Entradas fixas                                                      */
/* ------------------------------------------------------------------ */

export function FixedIncomeForm({ initial, currentMonth, onDone, onCancel }: {
  initial?: FixedIncome; currentMonth: MonthKey; onDone: () => void; onCancel: () => void;
}) {
  const { financeCash } = useCommands();
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState(initial ? centsToInput(initial.amountCents) : '');
  const [day, setDay] = useState(String(initial?.dayOfMonth ?? ''));
  const [startMonth, setStartMonth] = useState(initial?.startMonth ?? currentMonth);
  const [endMonth, setEndMonth] = useState<string | null>(initial?.endMonth ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const { pending, error, run } = useAction();
  const cents = parseMoneyInput(amount);
  const endIncomplete = endMonth === '';

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (cents === null || endIncomplete) return;
        const input = {
          description, amountCents: cents, dayOfMonth: Number(day), startMonth,
          endMonth: endMonth || null, notes: notes || null,
        };
        const ok = await run(async () => {
          if (initial) await financeCash.updateFixedIncome(initial.id, input);
          else await financeCash.createFixedIncome(input);
        });
        if (ok) onDone();
      }}
    >
      <Field label="Descrição">{(id) => <input id={id} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={200} placeholder="Ex.: Manutenção Cliente A" />}</Field>
      <MoneyField label="Valor mensal" value={amount} onChange={setAmount} />
      <Field label="Dia previsto do recebimento">{(id) => <input id={id} type="number" inputMode="numeric" min={1} max={31} className={inputClass} value={day} onChange={(e) => setDay(e.target.value)} required />}</Field>
      <Field label="Começa em" hint="Meses anteriores sem recebimento confirmado aparecem como atrasados.">
        {(id) => <input id={id} type="month" className={inputClass} value={startMonth} onChange={(e) => setStartMonth(e.target.value)} required />}
      </Field>
      <EndMonthField value={endMonth} onChange={setEndMonth} min={startMonth} />
      <details open={Boolean(initial?.notes)} className="rounded-xl border border-[var(--line)] p-3">
        <summary className="cursor-pointer text-sm font-medium">Mais detalhes (opcional)</summary>
        <div className="mt-3">
          <Field label="Observação">{(id) => <textarea id={id} rows={2} className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />}</Field>
        </div>
      </details>
      <ErrorText message={error} />
      <div className="flex flex-wrap justify-between gap-2">
        {initial ? (
          <button type="button" className={buttonSecondary} disabled={pending} onClick={async () => {
            if (await run(() => financeCash.deactivateFixedIncome(initial.id))) onDone();
          }}>Desativar</button>
        ) : <span />}
        <div className="flex gap-2">
          <button type="button" className={buttonSecondary} onClick={onCancel}>Cancelar</button>
          <button type="submit" className={buttonPrimary} disabled={pending || cents === null || cents <= 0 || !description.trim() || !day || endIncomplete}>
            {pending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </form>
  );
}

type IncomeAction =
  | { kind: 'receive'; row: IncomeMonthRow | (MonthEntry & { month: MonthKey }) }
  | { kind: 'amount'; row: { incomeId: string; description: string; month: MonthKey; amountCents: number } }
  | { kind: 'reset'; row: IncomeMonthRow };

function FixedIncomeBlock({ incomes, occurrences, view, balanceUpdatedAt, showAdd }: { incomes: FixedIncome[]; occurrences: IncomeOccurrence[]; view: MonthView; balanceUpdatedAt: string | null; showAdd: boolean }) {
  const { financeCash } = useCommands();
  const [form, setForm] = useState<null | { initial?: FixedIncome }>(null);
  const [action, setAction] = useState<IncomeAction | null>(null);
  const [addToBalance, setAddToBalance] = useState(true);
  const [removeFromBalance, setRemoveFromBalance] = useState(true);
  const [amountText, setAmountText] = useState('');
  const { pending, error, run, clearError } = useAction();

  const active = incomes.filter((i) => i.active);
  const occurrenceByKey = new Map(occurrences.map((o) => [`${o.incomeId}|${o.month}`, o]));
  // Pendentes (inclui atrasadas de meses anteriores) e já resolvidas (recebidas/canceladas) do mês escolhido.
  const pendingLines = view.incomeFixed.filter((e) => e.state === 'pending');
  const resolved: IncomeMonthRow[] = view.incomeFixed
    .filter((e) => e.state !== 'pending')
    .map((e) => ({
      incomeId: e.id, description: e.label, month: e.month, date: e.date ?? '', amountCents: e.amountCents,
      status: e.state === 'done' ? 'received' : 'cancelled', hasAmountOverride: false,
    }));
  const expectedOwn = view.incomeFixed.filter((e) => !e.carriedOver && e.state !== 'cancelled');
  const expectedCents = expectedOwn.reduce((t, e) => t + e.amountCents, 0);
  const receivedCents = expectedOwn.filter((e) => e.state === 'done').reduce((t, e) => t + e.amountCents, 0);

  const canRemove = (r: IncomeMonthRow) => {
    const occ = occurrenceByKey.get(`${r.incomeId}|${r.month}`);
    return Boolean(r.status === 'received' && occ?.addedToBalance && balanceUpdatedAt && occ.receivedAt && new Date(balanceUpdatedAt).getTime() <= new Date(occ.receivedAt).getTime());
  };

  const open = (a: IncomeAction) => {
    clearError();
    setAddToBalance(true);
    setRemoveFromBalance(true);
    if (a.kind === 'amount') setAmountText(centsToInput(a.row.amountCents));
    setAction(a);
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Entradas fixas</h3>
          <p className="text-xs text-[var(--text-muted)]">Receitas que se repetem todo mês.</p>
        </div>
        {showAdd && <button type="button" className={buttonGhost} onClick={() => setForm({})}><Plus size={14} /> Adicionar</button>}
      </div>
      <div className="mt-1">
        <Money cents={expectedCents} size="md" tone="positive" />
        <span className="ml-2 text-xs text-[var(--text-muted)]">no mês · <Money cents={receivedCents} size="sm" tone="muted" /> já recebido</span>
      </div>

      {pendingLines.length === 0 && resolved.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          {active.length === 0 ? 'Nenhuma entrada fixa cadastrada.' : 'Nenhuma entrada fixa prevista para este mês.'}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-[var(--line)]">
          {pendingLines.map((l) => {
            const m = l.month;
            return (
              <li key={`${l.id}-${m}`} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm">{l.label}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    {l.date ? formatDateBR(l.date) : ''}
                    <Chip tone="info">Previsto</Chip>
                    {l.overdue && <Chip tone="negative">Atrasado</Chip>}
                    {l.carriedOver && <span>de {monthLabel(l.month)} · fora do resultado deste mês</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" className="tabular text-sm font-semibold hover:underline" title="Mudar o valor só deste mês"
                    onClick={() => open({ kind: 'amount', row: { incomeId: l.id, description: l.label, month: m, amountCents: l.amountCents } })}>
                    <Money cents={l.amountCents} tone="positive" />
                  </button>
                  <button type="button" className={buttonGhost} aria-label={`Marcar ${l.label} como recebida`}
                    onClick={() => open({ kind: 'receive', row: { ...l, month: m } })}>
                    <Check size={14} /> Recebi
                  </button>
                </div>
              </li>
            );
          })}
          {resolved.map((r) => (
            <li key={`${r.incomeId}-${r.month}`} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm text-[var(--text-muted)]">{r.description}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                  {formatDateBR(r.date)}
                  <Chip tone={r.status === 'received' ? 'positive' : 'neutral'}>{r.status === 'received' ? 'Recebida' : 'Não vai receber'}</Chip>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Money cents={r.amountCents} tone="muted" />
                <button type="button" className={buttonGhost} onClick={() => open({ kind: 'reset', row: r })}>Desfazer</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {active.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-[var(--accent)]">Gerenciar entradas fixas ({active.length})</summary>
          <ul className="mt-2 divide-y divide-[var(--line)]">
            {active.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm">{i.description}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Todo dia {i.dayOfMonth} · de {monthLabel(i.startMonth)} {i.endMonth ? `até ${monthLabel(i.endMonth)} (inclusive)` : 'sem data final'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Money cents={i.amountCents} size="sm" />
                  <button type="button" className={buttonGhost} onClick={() => setForm({ initial: i })}>Editar</button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Dialog open={form !== null} title={form?.initial ? 'Editar entrada fixa' : 'Nova entrada fixa'} onClose={() => setForm(null)}>
        {form && <FixedIncomeForm initial={form.initial} currentMonth={view.month} onDone={() => setForm(null)} onCancel={() => setForm(null)} />}
      </Dialog>

      <Dialog
        open={action !== null}
        title={action?.kind === 'receive' ? 'Marcar como recebida' : action?.kind === 'amount' ? 'Valor deste mês' : 'Desfazer'}
        onClose={() => setAction(null)}
      >
        {action?.kind === 'receive' && (() => {
          const row = action.row;
          const incomeId = 'incomeId' in row ? row.incomeId : row.id;
          const rowMonth = row.month;
          const label = 'description' in row ? row.description : row.label;
          return (
            <div className="space-y-4">
              <p className="text-sm">{label} · {monthLabel(rowMonth)} — <Money cents={row.amountCents} size="sm" /></p>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={addToBalance} onChange={(e) => setAddToBalance(e.target.checked)} />
                <span>
                  Somar ao saldo disponível
                  <span className="block text-xs text-[var(--text-muted)]">Desmarque se você já atualizou o saldo depois de receber. Confirmar duas vezes nunca soma duas vezes.</span>
                </span>
              </label>
              <ErrorText message={error} />
              <div className="flex flex-wrap justify-between gap-2">
                <button type="button" className={buttonSecondary} disabled={pending} onClick={async () => {
                  if (await run(() => financeCash.resetIncomeOccurrence(incomeId, rowMonth, 'cancelled', false))) setAction(null);
                }}>Não vou receber neste mês</button>
                <button type="button" className={buttonPrimary} disabled={pending} onClick={async () => {
                  if (await run(() => financeCash.markIncomeReceived(incomeId, rowMonth, addToBalance))) setAction(null);
                }}>{pending ? 'Salvando…' : 'Confirmar'}</button>
              </div>
            </div>
          );
        })()}

        {action?.kind === 'amount' && (
          <div className="space-y-4">
            <p className="text-sm">{action.row.description} · {monthLabel(action.row.month)}</p>
            <MoneyField label="Valor só para este mês" value={amountText} onChange={setAmountText} hint="Os outros meses continuam com o valor padrão." />
            <ErrorText message={error} />
            <div className="flex justify-between gap-2">
              <button type="button" className={buttonSecondary} disabled={pending} onClick={async () => {
                if (await run(() => financeCash.setIncomeMonthAmount(action.row.incomeId, action.row.month, null))) setAction(null);
              }}>Voltar ao valor padrão</button>
              <button type="button" className={buttonPrimary} disabled={pending || (parseMoneyInput(amountText) ?? 0) <= 0} onClick={async () => {
                const cents = parseMoneyInput(amountText);
                if (cents && await run(() => financeCash.setIncomeMonthAmount(action.row.incomeId, action.row.month, cents))) setAction(null);
              }}>Salvar</button>
            </div>
          </div>
        )}

        {action?.kind === 'reset' && (
          <div className="space-y-4">
            <p className="text-sm">{action.row.description} · {monthLabel(action.row.month)}</p>
            {(() => {
              const occ = occurrenceByKey.get(`${action.row.incomeId}|${action.row.month}`);
              if (action.row.status !== 'received' || !occ?.addedToBalance) return null;
              // Só dá para reverter com segurança se nada mexeu no saldo depois da confirmação.
              const safe = Boolean(balanceUpdatedAt && occ.receivedAt && new Date(balanceUpdatedAt).getTime() <= new Date(occ.receivedAt).getTime());
              return safe ? (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={removeFromBalance} onChange={(e) => setRemoveFromBalance(e.target.checked)} />
                  <span>
                    Remover do saldo disponível
                    <span className="block text-xs text-[var(--text-muted)]">Tira exatamente o valor que foi somado na confirmação (<Money cents={occ.receivedCents ?? 0} size="sm" />).</span>
                  </span>
                </label>
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  O saldo foi alterado depois desta confirmação, então o valor <strong>não será removido automaticamente</strong>. Se precisar, ajuste o saldo manualmente.
                </p>
              );
            })()}
            <ErrorText message={error} />
            <div className="flex justify-end gap-2">
              <button type="button" className={buttonSecondary} onClick={() => setAction(null)}>Voltar</button>
              <button type="button" className={buttonPrimary} disabled={pending} onClick={async () => {
                if (await run(() => financeCash.resetIncomeOccurrence(action.row.incomeId, action.row.month, 'pending', removeFromBalance && canRemove(action.row)))) setAction(null);
              }}>Voltar para previsto</button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Seção                                                               */
/* ------------------------------------------------------------------ */

export function ReceivablesSection({ receivables, view, fixedIncomes, incomeOccurrences, balanceUpdatedAt, showAdd = true }: {
  receivables: Receivable[]; view: MonthView; fixedIncomes: FixedIncome[]; incomeOccurrences: IncomeOccurrence[]; balanceUpdatedAt: string | null;
  /** false = o cadastro de novas entradas fica no fluxo único "Registrar movimentação". */
  showAdd?: boolean;
}) {
  const s = view.sustainability;
  const receivedCents = s.incomeLines.filter((l) => l.done).reduce((t, l) => t + l.amountCents, 0);
  return (
    <Card aria-label="Entradas do mês">
      <Eyebrow>Entradas do mês</Eyebrow>
      <div className="mt-1">
        <Money cents={s.incomeCents} size="lg" tone="positive" />
        <span className="ml-2 text-xs text-[var(--text-muted)]">cadastradas no mês (fixas + pontuais confirmadas)</span>
      </div>
      {s.incomeCents > 0 && (
        <div className="mt-2">
          <SplitBar label="Entradas recebidas" tone="positive" totalCents={s.incomeCents} doneCents={receivedCents} doneLabel="recebido" pendingLabel="a receber" />
        </div>
      )}
      <div className="mt-4 space-y-5 divide-y divide-[var(--line)] [&>div]:pt-4 [&>div:first-child]:pt-0">
        <FixedIncomeBlock incomes={fixedIncomes} occurrences={incomeOccurrences} view={view} balanceUpdatedAt={balanceUpdatedAt} showAdd={showAdd} />
        <OneOffBlock receivables={receivables} view={view} showAdd={showAdd} />
      </div>
      {s.duplicateWarnings.filter((w) => w.includes('parece repetir')).map((w) => (
        <p key={w} className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{w}</p>
      ))}
    </Card>
  );
}

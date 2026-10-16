'use client';

import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { useCommands } from '@/providers/repository.provider';
import type { Commitment } from '@/modules/finance/cash/domain/types';
import type { CardFixedLine, CardFixedState, MonthLine, MonthProjection } from '@/modules/finance/cash/domain/projection';
import { CARD_IDS, CARD_FULL_LABELS, monthOf, type CardId } from '@/modules/finance/cash/domain/month';
import {
  Card, Chip, Dialog, EndMonthField, ErrorText, Eyebrow, Field, Money, MoneyField, buttonGhost, buttonPrimary, buttonSecondary,
  formatDateBR, inputClass, parseMoneyInput, centsToInput, useAction,
} from './ui';

const STATE_LABEL: Record<CardFixedState, { text: string; tone: 'positive' | 'warning' | 'info' }> = {
  reconciled: { text: 'Conciliado na fatura', tone: 'positive' },
  manual_included: { text: 'Marcado como incluído na fatura', tone: 'info' },
  not_found_in_invoice: { text: 'Não encontrado na fatura — confira', tone: 'warning' },
  awaiting_invoice: { text: 'Aguardando a fatura (somado como estimativa)', tone: 'warning' },
};

export function CommitmentForm({ initial, currentMonth, onDone, onCancel, defaultRecurrence = 'monthly' }: {
  initial?: Commitment; currentMonth: string; onDone: () => void; onCancel: () => void; defaultRecurrence?: 'none' | 'monthly';
}) {
  const { financeCash } = useCommands();
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState(initial ? centsToInput(initial.amountCents) : '');
  const [recurrence, setRecurrence] = useState<'none' | 'monthly'>(initial?.recurrence ?? defaultRecurrence);
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '');
  const [day, setDay] = useState(String(initial?.dayOfMonth ?? ''));
  const [startMonth, setStartMonth] = useState(initial?.startMonth ?? currentMonth);
  const [endMonth, setEndMonth] = useState<string | null>(initial?.endMonth ?? null);
  const [billing, setBilling] = useState<'direct' | 'card'>(initial?.billing ?? 'direct');
  const [card, setCard] = useState<CardId>(initial?.card ?? 'nubank_1');
  const [category, setCategory] = useState(initial?.category ?? '');
  const { pending, error, run } = useAction();
  const cents = parseMoneyInput(amount);
  const endIncomplete = recurrence === 'monthly' && endMonth === '';

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (cents === null || endIncomplete) return;
        const input = {
          description, amountCents: cents, recurrence,
          dueDate: recurrence === 'none' ? dueDate : null,
          dayOfMonth: recurrence === 'monthly' ? Number(day) : null,
          startMonth: recurrence === 'none' && dueDate ? monthOf(dueDate) : startMonth,
          endMonth: recurrence === 'monthly' && endMonth ? endMonth : null,
          billing, card: billing === 'card' ? card : null, category: category || null,
        };
        const ok = await run(async () => {
          if (initial) await financeCash.updateCommitment(initial.id, input, initial.updatedAt);
          else await financeCash.createCommitment(input);
        });
        if (ok) onDone();
      }}
    >
      <Field label="Descrição">{(id) => <input id={id} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={200} />}</Field>
      <MoneyField label="Valor" value={amount} onChange={setAmount} />
      <Field label="Frequência">
        {(id) => (
          <select id={id} className={inputClass} value={recurrence} onChange={(e) => setRecurrence(e.target.value as 'none' | 'monthly')}>
            <option value="monthly">Todo mês (recorrente)</option>
            <option value="none">Avulso (uma vez)</option>
          </select>
        )}
      </Field>
      {recurrence === 'none' ? (
        <Field label="Vencimento">{(id) => <input id={id} type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />}</Field>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dia do mês">{(id) => <input id={id} type="number" min={1} max={31} className={inputClass} value={day} onChange={(e) => setDay(e.target.value)} required />}</Field>
          <Field label="A partir de">{(id) => <input id={id} type="month" className={inputClass} value={startMonth} onChange={(e) => setStartMonth(e.target.value)} required />}</Field>
          <div className="col-span-2">
            <EndMonthField value={endMonth} onChange={setEndMonth} min={startMonth} />
          </div>
        </div>
      )}
      <Field label="Forma de cobrança" hint={billing === 'card' ? 'Já está dentro da fatura: aparece aqui, mas o total a pagar considera só a fatura.' : undefined}>
        {(id) => (
          <select id={id} className={inputClass} value={billing} onChange={(e) => setBilling(e.target.value as 'direct' | 'card')}>
            <option value="direct">Pago direto (boleto, Pix, débito)</option>
            <option value="card">Cobrado na fatura do cartão</option>
          </select>
        )}
      </Field>
      {billing === 'card' && (
        <Field label="Cartão">
          {(id) => (
            <select id={id} className={inputClass} value={card} onChange={(e) => setCard(e.target.value as CardId)}>
              {CARD_IDS.map((c) => <option key={c} value={c}>{CARD_FULL_LABELS[c]}</option>)}
            </select>
          )}
        </Field>
      )}
      <Field label="Categoria (opcional)">{(id) => <input id={id} className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} />}</Field>
      <ErrorText message={error} />
      <div className="flex flex-wrap justify-between gap-2">
        {initial ? (
          <button type="button" className={buttonSecondary} disabled={pending} onClick={async () => {
            if (await run(() => financeCash.archiveCommitment(initial.id))) onDone();
          }}>Encerrar compromisso</button>
        ) : <span />}
        <div className="flex gap-2">
          <button type="button" className={buttonSecondary} onClick={onCancel}>Cancelar</button>
          <button type="submit" className={buttonPrimary} disabled={pending || cents === null || cents <= 0 || !description.trim() || endIncomplete}>
            {pending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </form>
  );
}

export function CommitmentsSection({ commitments, month, showAdd = true }: { commitments: Commitment[]; month: MonthProjection; showAdd?: boolean }) {
  const { financeCash } = useCommands();
  const [form, setForm] = useState<null | { initial?: Commitment }>(null);
  const [paying, setPaying] = useState<MonthLine | null>(null);
  const [deduct, setDeduct] = useState(true);
  const [editingAmount, setEditingAmount] = useState<MonthLine | null>(null);
  const [amountText, setAmountText] = useState('');
  const { pending, error, run, clearError } = useAction();
  const byId = new Map(commitments.map((c) => [c.id, c]));

  const monthOfLine = (l: MonthLine) => (l.date ? monthOf(l.date) : month.month);

  const directRows = month.directLines.map((l) => (
    <li key={`${l.id}-${l.date}`} className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <button type="button" className="truncate text-left text-sm hover:underline" onClick={() => byId.get(l.id) && setForm({ initial: byId.get(l.id) })}>{l.label}</button>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          {l.date ? `vence ${formatDateBR(l.date)}` : ''}
          {l.overdue && <Chip tone="negative">Atrasado</Chip>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" className="tabular text-sm font-semibold hover:underline" onClick={() => { clearError(); setAmountText(centsToInput(l.amountCents)); setEditingAmount(l); }} title="Editar o valor só deste mês">
          <Money cents={l.amountCents} />
        </button>
        <button type="button" className={buttonGhost} onClick={() => { clearError(); setDeduct(true); setPaying(l); }} aria-label={`Marcar ${l.label} como pago`}>
          <Check size={14} /> Paguei
        </button>
      </div>
    </li>
  ));

  const cardRows = month.cardFixedLines.map((l: CardFixedLine) => {
    const included = l.state === 'manual_included';
    return (
      <li key={`${l.id}-${l.date}`} className="py-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm">{l.label}</p>
          <Money cents={l.amountCents} tone={l.countedCents > 0 ? 'default' : 'muted'} />
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
          {CARD_FULL_LABELS[l.card]}
          <Chip tone={STATE_LABEL[l.state].tone}>{STATE_LABEL[l.state].text}</Chip>
          {l.state !== 'reconciled' && (
            <button type="button" className={buttonGhost} onClick={() => void financeCash.setIncludedInInvoice(l.id, monthOfLine(l), !included)}>
              {included ? 'Desfazer' : 'Já está na fatura'}
            </button>
          )}
        </p>
      </li>
    );
  });

  return (
    <Card aria-label="Compromissos do mês">
      <div className="flex items-start justify-between gap-3">
        <Eyebrow>Compromissos do mês</Eyebrow>
        {showAdd && <button type="button" className={buttonGhost} onClick={() => setForm({})}><Plus size={14} /> Adicionar</button>}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <Money cents={month.directCents + month.cardFixedEstimatedCents} size="lg" />
        <span className="text-xs text-[var(--text-muted)]">fora das faturas</span>
      </div>
      {month.directLines.length === 0 && month.cardFixedLines.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--text-muted)]">Nenhum compromisso pendente neste mês.</p>
      ) : (
        <details className="mt-3" open={month.directLines.length + month.cardFixedLines.length <= 4}>
          <summary className="cursor-pointer text-xs font-medium text-[var(--accent)]">Ver compromissos</summary>
          {directRows.length > 0 && <ul className="mt-2 divide-y divide-[var(--line)]">{directRows}</ul>}
          {cardRows.length > 0 && (
            <>
              <p className="mt-3 text-xs font-medium text-[var(--text-muted)]">Gastos fixos no cartão</p>
              <ul className="divide-y divide-[var(--line)]">{cardRows}</ul>
            </>
          )}
        </details>
      )}

      <Dialog open={form !== null} title={form?.initial ? 'Editar compromisso' : 'Novo compromisso'} onClose={() => setForm(null)}>
        {form && <CommitmentForm initial={form.initial} currentMonth={month.month} onDone={() => setForm(null)} onCancel={() => setForm(null)} />}
      </Dialog>

      <Dialog open={paying !== null} title="Marcar como pago" onClose={() => setPaying(null)}>
        {paying && (
          <div className="space-y-4">
            <p className="text-sm">{paying.label} — <Money cents={paying.amountCents} size="sm" /></p>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={deduct} onChange={(e) => setDeduct(e.target.checked)} />
              <span>
                Descontar do saldo disponível
                <span className="block text-xs text-[var(--text-muted)]">Desmarque se você já atualizou o saldo depois de pagar.</span>
              </span>
            </label>
            <ErrorText message={error} />
            <div className="flex justify-end gap-2">
              <button type="button" className={buttonSecondary} onClick={() => setPaying(null)}>Cancelar</button>
              <button type="button" className={buttonPrimary} disabled={pending} onClick={async () => {
                if (await run(() => financeCash.markCommitmentPaid(paying.id, monthOfLine(paying), deduct))) setPaying(null);
              }}>{pending ? 'Salvando…' : 'Confirmar'}</button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={editingAmount !== null} title="Valor deste mês" onClose={() => setEditingAmount(null)}>
        {editingAmount && (
          <div className="space-y-4">
            <p className="text-sm">{editingAmount.label}</p>
            <MoneyField label="Valor só para este mês" value={amountText} onChange={setAmountText} hint="Os outros meses continuam com o valor padrão." />
            <ErrorText message={error} />
            <div className="flex justify-end gap-2">
              <button type="button" className={buttonSecondary} onClick={() => setEditingAmount(null)}>Cancelar</button>
              <button type="button" className={buttonPrimary} disabled={pending || (parseMoneyInput(amountText) ?? 0) <= 0} onClick={async () => {
                const cents = parseMoneyInput(amountText);
                if (cents && await run(() => financeCash.setOccurrenceAmount(editingAmount.id, monthOfLine(editingAmount), cents))) setEditingAmount(null);
              }}>Salvar</button>
            </div>
          </div>
        )}
      </Dialog>
    </Card>
  );
}

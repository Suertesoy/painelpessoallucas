'use client';

import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { useCommands } from '@/providers/repository.provider';
import type { Receivable } from '@/modules/finance/cash/domain/types';
import type { MonthProjection } from '@/modules/finance/cash/domain/projection';
import {
  Card, Chip, Dialog, ErrorText, Eyebrow, Field, Money, MoneyField, buttonGhost, buttonPrimary, buttonSecondary,
  formatDateBR, inputClass, parseMoneyInput, centsToInput, useAction,
} from './ui';

function ReceivableForm({ initial, onDone, onCancel }: { initial?: Receivable; onDone: () => void; onCancel: () => void }) {
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
          if (initial) await financeCash.updateReceivable(initial.id, input);
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

export function ReceivablesSection({ receivables, month }: { receivables: Receivable[]; month: MonthProjection }) {
  const { financeCash } = useCommands();
  const [form, setForm] = useState<null | { initial?: Receivable }>(null);
  const [receiving, setReceiving] = useState<Receivable | null>(null);
  const [addToBalance, setAddToBalance] = useState(true);
  const { pending, error, run, clearError } = useAction();

  const open = receivables.filter((r) => r.status === 'confirmed' || r.status === 'uncertain');
  const byId = new Map(open.map((r) => [r.id, r]));
  const lines = [...month.receipts, ...month.uncertainReceipts].map((l) => byId.get(l.id)).filter((r): r is Receivable => Boolean(r));
  const later = open.filter((r) => !lines.some((l) => l.id === r.id));

  const row = (r: Receivable) => (
    <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm">{r.description}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
          {formatDateBR(r.expectedDate)}
          {r.status === 'uncertain' && <Chip tone="warning">Incerto</Chip>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Money cents={r.amountCents} tone={r.status === 'uncertain' ? 'muted' : 'positive'} />
        <button type="button" className={buttonGhost} onClick={() => { clearError(); setAddToBalance(true); setReceiving(r); }} aria-label={`Marcar ${r.description} como recebido`}>
          <Check size={14} /> Recebi
        </button>
        <button type="button" className={buttonGhost} onClick={() => setForm({ initial: r })}>Editar</button>
      </div>
    </li>
  );

  return (
    <Card aria-label="Recebimentos confirmados">
      <div className="flex items-start justify-between gap-3">
        <Eyebrow>Recebimentos confirmados do mês</Eyebrow>
        <button type="button" className={buttonGhost} onClick={() => setForm({})}><Plus size={14} /> Adicionar</button>
      </div>
      <div className="mt-1"><Money cents={month.receiptsCents} size="lg" tone="positive" /></div>
      {month.uncertainReceiptsCents > 0 && (
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Mais <Money cents={month.uncertainReceiptsCents} size="sm" tone="muted" /> incertos — fora da conta.
        </p>
      )}
      {(lines.length > 0 || later.length > 0) && (
        <details className="mt-3 group">
          <summary className="cursor-pointer text-xs font-medium text-[var(--accent)]">Ver recebimentos</summary>
          <ul className="mt-2 divide-y divide-[var(--line)]">{lines.map(row)}</ul>
          {later.length > 0 && (
            <>
              <p className="mt-3 text-xs text-[var(--text-muted)]">Em meses seguintes</p>
              <ul className="divide-y divide-[var(--line)]">{later.map(row)}</ul>
            </>
          )}
        </details>
      )}
      {lines.length === 0 && later.length === 0 && (
        <p className="mt-2 text-xs text-[var(--text-muted)]">Nenhum recebimento cadastrado. Adicione o que você tem a receber.</p>
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
    </Card>
  );
}

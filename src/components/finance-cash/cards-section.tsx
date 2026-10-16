'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Upload } from 'lucide-react';
import { useCommands } from '@/providers/repository.provider';
import { effectiveInvoiceAmount, invoiceAmountsDiverge, type CardInvoice } from '@/modules/finance/cash/domain/types';
import { InvoiceStatusChip, InvoiceStatusDialog } from './invoice-status';
import { CARD_IDS, CARD_FULL_LABELS, addMonths, monthLabel, type CardId, type MonthKey } from '@/modules/finance/cash/domain/month';
import {
  Card, Chip, Dialog, ErrorText, Eyebrow, Field, Money, MoneyField, buttonGhost, buttonPrimary, buttonSecondary,
  centsToInput, formatDateBR, formatDateTimeBR, inputClass, parseMoneyInput, useAction,
} from './ui';
import { isoToDateInput } from '@/lib/dates';

function InvoiceEditor({ card, month, invoice, onDone }: { card: CardId; month: MonthKey; invoice: CardInvoice | null; onDone: () => void }) {
  const { financeCash } = useCommands();
  const [amount, setAmount] = useState(invoice?.manualAmountCents != null ? centsToInput(invoice.manualAmountCents) : '');
  const [dueDate, setDueDate] = useState(invoice?.dueDate ?? '');
  const { pending, error, run } = useAction();
  const cents = amount.trim() === '' ? null : parseMoneyInput(amount);
  const invalid = amount.trim() !== '' && (cents === null || cents < 0);

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--text-muted)]">{CARD_FULL_LABELS[card]} · vencimento em {monthLabel(month)}</p>
      {invoice && invoice.importedAmountCents !== null && (
        <p className="rounded-lg bg-[var(--surface)] p-3 text-xs text-[var(--text-muted)]">
          O valor importado do CSV (<Money cents={invoice.importedAmountCents} size="sm" />) é o que vale na conta.
          O valor manual abaixo fica só como referência.
        </p>
      )}
      <MoneyField label="Valor da fatura (manual)" value={amount} onChange={setAmount} hint="Use enquanto não importar o CSV. Pode ser atualizado quantas vezes quiser." />
      <Field label="Data de vencimento">{(id) => <input id={id} type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}</Field>
      {invoice && <p className="text-xs text-[var(--text-muted)]">A situação (aberta, fechada ou paga) é alterada no botão “Situação” da fatura.</p>}
      <ErrorText message={error} />
      <div className="flex justify-end gap-2">
        <button type="button" className={buttonSecondary} onClick={onDone}>Cancelar</button>
        <button type="button" className={buttonPrimary} disabled={pending || invalid} onClick={async () => {
          const ok = await run(async () => {
            await financeCash.saveInvoiceManual({ card, month, amountCents: cents, dueDate: dueDate || null });
          });
          if (ok) onDone();
        }}>{pending ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </div>
  );
}

function CardInvoiceBlock({ card, month, invoice, missingCount }: { card: CardId; month: MonthKey; invoice: CardInvoice | null; missingCount: number }) {
  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const amount = invoice ? effectiveInvoiceAmount(invoice) : null;
  const importHref = `/financas/fatura/importar?card=${card}&month=${month}`;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-inset)] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{CARD_FULL_LABELS[card]}</p>
        {invoice && <InvoiceStatusChip status={invoice.status} />}
      </div>
      {!invoice ? (
        <p className="mt-2 text-sm text-[var(--text-muted)]">Nenhuma fatura cadastrada para este mês.</p>
      ) : (
        <>
          <div className="mt-1">
            {amount !== null ? <Money cents={amount} size="lg" tone={invoice.status === 'paid' ? 'muted' : 'default'} /> : (
              <span className="text-sm text-[var(--text-muted)]">Sem valor informado</span>
            )}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {invoice.dueDate ? `Vence ${formatDateBR(invoice.dueDate)} · ` : ''}
            {invoice.status === 'paid' && invoice.paidAt ? `paga em ${formatDateBR(isoToDateInput(invoice.paidAt))} · ` : ''}
            {invoice.lastImportedAt ? `CSV importado em ${formatDateTimeBR(invoice.lastImportedAt)}` : 'CSV ainda não importado'}
          </p>
        </>
      )}
      {invoice && missingCount > 0 && (
        <p className="mt-1 text-xs text-[var(--money-warning)]">
          {missingCount} lançamento(s) sumiram do último CSV e seguem somados. <Link href={`/financas/fatura/${invoice.id}`} className="underline">Revisar</Link>
        </p>
      )}
      {invoice && invoiceAmountsDiverge(invoice) && (
        <p className="mt-1 text-xs text-[var(--money-warning)]">
          O valor manual (<Money cents={invoice.manualAmountCents ?? 0} size="sm" tone="warning" />) difere do importado. Vale o importado.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={importHref} className={buttonSecondary}><Upload size={14} /> Importar CSV</Link>
        {invoice && <button type="button" className={buttonSecondary} onClick={() => setStatusOpen(true)} aria-label={`Situação da fatura ${CARD_FULL_LABELS[card]}`}>Situação</button>}
        <button type="button" className={buttonSecondary} onClick={() => setEditing(true)}>{invoice ? 'Editar' : 'Informar valor'}</button>
        {invoice && invoice.importedAmountCents !== null && (
          <Link href={`/financas/fatura/${invoice.id}`} className={buttonGhost}>Ver lançamentos</Link>
        )}
      </div>
      {invoice && statusOpen && <InvoiceStatusDialog invoice={invoice} open onClose={() => setStatusOpen(false)} />}
      <Dialog open={editing} title={`Fatura ${CARD_FULL_LABELS[card]}`} onClose={() => setEditing(false)}>
        <InvoiceEditor card={card} month={month} invoice={invoice} onDone={() => setEditing(false)} />
      </Dialog>
    </div>
  );
}

/**
 * Todas as faturas cadastradas, por mês de vencimento. O mês escolhido (por
 * padrão o atual) mostra os DOIS cartões; a lista abaixo mostra TODOS os
 * meses com fatura — nada é cortado nem escondido. Nenhuma fatura vazia é
 * criada só para preencher meses.
 */
export function CardsSection({ invoices, currentMonth, missingByInvoice }: { invoices: CardInvoice[]; currentMonth: MonthKey; missingByInvoice: Record<string, number> }) {
  const [selected, setSelected] = useState<MonthKey>(currentMonth);
  const find = (card: CardId, month: MonthKey) => invoices.find((i) => i.card === card && i.month === month) ?? null;

  const byMonth = new Map<MonthKey, CardInvoice[]>();
  for (const inv of invoices) byMonth.set(inv.month, [...(byMonth.get(inv.month) ?? []), inv]);
  const months = [...byMonth.keys()].sort();
  const stale = invoices.filter((i) => i.status !== 'paid' && i.month < currentMonth).sort((a, b) => a.month.localeCompare(b.month));

  return (
    <Card aria-label="Faturas dos cartões">
      <Eyebrow>Faturas</Eyebrow>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button type="button" className={buttonSecondary} onClick={() => setSelected(addMonths(selected, -1))} aria-label="Mês anterior"><ChevronLeft size={16} /></button>
        <div className="text-center">
          <p className="text-sm font-semibold capitalize">{monthLabel(selected)}</p>
          {selected !== currentMonth && (
            <button type="button" className={buttonGhost} onClick={() => setSelected(currentMonth)}>Voltar ao mês atual</button>
          )}
        </div>
        <button type="button" className={buttonSecondary} onClick={() => setSelected(addMonths(selected, 1))} aria-label="Próximo mês"><ChevronRight size={16} /></button>
      </div>
      <p className="mt-1 text-center text-xs text-[var(--text-muted)]">Mês de vencimento da fatura</p>

      {stale.length > 0 && (
        <div role="status" className="mt-3 rounded-xl border border-[var(--money-warning)] p-3 text-sm">
          <p className="font-medium">{stale.length === 1 ? 'Há uma fatura antiga marcada como não paga. Confira o status.' : `Há ${stale.length} faturas antigas marcadas como não pagas. Confira o status.`}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {stale.map((i) => (
              <button key={i.id} type="button" className={buttonSecondary} onClick={() => setSelected(i.month)}>
                {CARD_FULL_LABELS[i.card]} · <span className="capitalize">{monthLabel(i.month)}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">Se já foi paga, abra “Situação” e confirme o pagamento histórico — o saldo não é alterado.</p>
        </div>
      )}

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {CARD_IDS.map((card) => {
          const inv = find(card, selected);
          return <CardInvoiceBlock key={`${card}-${selected}`} card={card} month={selected} invoice={inv} missingCount={missingByInvoice[inv?.id ?? ''] ?? 0} />;
        })}
      </div>

      <details className="mt-4 border-t border-[var(--line)] pt-3">
        <summary className="cursor-pointer text-sm font-medium text-[var(--text-muted)]">
          {months.length === 0
            ? 'Nenhuma fatura cadastrada ainda. Importe um CSV ou informe o valor de uma fatura.'
            : `Todas as faturas cadastradas (${invoices.length} em ${months.length} ${months.length === 1 ? 'mês' : 'meses'})`}
        </summary>
        <ul className="mt-2 divide-y divide-[var(--line)]">
          {months.map((m) => (
            <li key={m} className={m === selected ? 'bg-[var(--surface-raised)]' : ''}>
              <button type="button" className="w-full px-1 py-2.5 text-left" onClick={() => setSelected(m)} aria-label={`Ver faturas de ${monthLabel(m)}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium capitalize">{monthLabel(m)}{m === currentMonth ? ' · mês atual' : ''}</span>
                  <span className="text-xs text-[var(--text-muted)]">{m === selected ? 'em exibição' : 'abrir'}</span>
                </span>
                <span className="mt-1 grid gap-0.5">
                  {CARD_IDS.map((card) => {
                    const inv = find(card, m);
                    const amount = inv ? effectiveInvoiceAmount(inv) : null;
                    return (
                      <span key={card} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-[var(--text-muted)]">{CARD_FULL_LABELS[card]}</span>
                        {inv ? (
                          <span className="flex items-center gap-1.5">
                            <InvoiceStatusChip status={inv.status} />
                            {amount !== null ? <Money cents={amount} size="sm" tone={inv.status === 'paid' ? 'muted' : 'default'} /> : <span className="text-[var(--text-muted)]">sem valor</span>}
                            {(missingByInvoice[inv.id] ?? 0) > 0 && <Chip tone="warning">revisar</Chip>}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">sem fatura</span>
                        )}
                      </span>
                    );
                  })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

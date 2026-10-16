'use client';

import { useState } from 'react';
import { useCommands } from '@/providers/repository.provider';
import { effectiveInvoiceAmount, type CardInvoice } from '@/modules/finance/cash/domain/types';
import { CARD_FULL_LABELS, monthLabel } from '@/modules/finance/cash/domain/month';
import { isoToDateInput, todayDateStr } from '@/lib/dates';
import { Chip, Dialog, ErrorText, Money, buttonPrimary, buttonSecondary, formatDateBR, inputClass, useAction } from './ui';

export type InvoiceStatusValue = CardInvoice['status'];

export const STATUS_LABEL: Record<InvoiceStatusValue, string> = { open: 'Aberta', closed: 'Fechada', paid: 'Paga' };
export const STATUS_TONE = { open: 'info', closed: 'warning', paid: 'positive' } as const;

const STATUS_HELP: Record<InvoiceStatusValue, string> = {
  open: 'Ainda recebendo compras. O valor pode mudar e ela não entra na média dos cartões.',
  closed: 'Valor consolidado, mas ainda não paga. Continua como obrigação pendente.',
  paid: 'Paga por inteiro. Sai das pendências e continua no histórico e na média.',
};

export function InvoiceStatusChip({ status }: { status: InvoiceStatusValue }) {
  return <Chip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Chip>;
}

/**
 * Situação da fatura: ver, mudar e CORRIGIR (Aberta / Fechada / Paga).
 * Marcar como paga tem dois caminhos bem separados:
 *  - confirmar um pagamento que já aconteceu (não mexe no saldo — é o padrão);
 *  - registrar a saída do saldo disponível agora (mexe no saldo, uma única vez).
 * Voltar de "Paga" para Aberta/Fechada pede confirmação, não apaga nada e não devolve saldo.
 */
export function InvoiceStatusDialog({ invoice, open, onClose }: { invoice: CardInvoice; open: boolean; onClose: () => void }) {
  const { financeCash } = useCommands();
  const [target, setTarget] = useState<InvoiceStatusValue>(invoice.status);
  const [paidOn, setPaidOn] = useState(() => (invoice.paidAt ? isoToDateInput(invoice.paidAt) : todayDateStr()));
  const [moveBalance, setMoveBalance] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const { pending, error, run } = useAction();

  const amount = effectiveInvoiceAmount(invoice);
  const undoing = invoice.status === 'paid' && target !== 'paid';
  const markingPaid = target === 'paid' && invoice.status !== 'paid';
  const changingDate = target === 'paid' && invoice.status === 'paid';
  const unchanged = target === invoice.status && !changingDate;
  const dateInvalid = target === 'paid' && (!paidOn || paidOn > todayDateStr());
  const blocked = unchanged || dateInvalid || (undoing && !understood) || pending;

  return (
    <Dialog open={open} title={`Situação · ${CARD_FULL_LABELS[invoice.card]}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg bg-[var(--surface)] p-3 text-sm">
          <p className="capitalize text-[var(--text-muted)]">Vencimento em {monthLabel(invoice.month)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {amount !== null ? <Money cents={amount} size="lg" /> : <span className="text-[var(--text-muted)]">Sem valor informado</span>}
            <InvoiceStatusChip status={invoice.status} />
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {invoice.dueDate ? `Vence ${formatDateBR(invoice.dueDate)}` : 'Sem data de vencimento'}
            {invoice.status === 'paid' && invoice.paidAt ? ` · paga em ${formatDateBR(isoToDateInput(invoice.paidAt))}` : ''}
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Nova situação</legend>
          {(['open', 'closed', 'paid'] as const).map((s) => (
            <label key={s} className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${target === s ? 'border-[var(--accent)] bg-[var(--surface-raised)]' : 'border-[var(--line)]'}`}>
              <input type="radio" name={`invoice-status-${invoice.id}`} className="mt-1" checked={target === s} onChange={() => { setTarget(s); setUnderstood(false); }} />
              <span>
                <span className="font-medium">{STATUS_LABEL[s]}{s === invoice.status ? ' (atual)' : ''}</span>
                <span className="block text-xs text-[var(--text-muted)]">{STATUS_HELP[s]}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {target === 'paid' && (
          <div className="space-y-3 rounded-xl border border-[var(--line)] p-3">
            <label className="block text-sm">
              <span className="font-medium">Data do pagamento</span>
              <input type="date" className={`${inputClass} mt-1`} value={paidOn} max={todayDateStr()} onChange={(e) => setPaidOn(e.target.value)} />
            </label>
            {markingPaid && (
              <fieldset className="space-y-2 text-sm">
                <legend className="font-medium">Isso mexe no saldo disponível?</legend>
                <label className="flex items-start gap-2">
                  <input type="radio" name={`invoice-balance-${invoice.id}`} className="mt-1" checked={!moveBalance} onChange={() => setMoveBalance(false)} />
                  <span>
                    Não, só confirmar um pagamento que já aconteceu
                    <span className="block text-xs text-[var(--text-muted)]">Registra a data e tira a fatura das pendências. O saldo fica como está: ele já refletia essa saída.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="radio" name={`invoice-balance-${invoice.id}`} className="mt-1" checked={moveBalance} onChange={() => setMoveBalance(true)} />
                  <span>
                    Sim, descontar agora do saldo disponível
                    <span className="block text-xs text-[var(--text-muted)]">Use só se o dinheiro ainda não saiu do saldo informado no app. Desconta uma única vez.</span>
                  </span>
                </label>
              </fieldset>
            )}
          </div>
        )}

        {undoing && (
          <div role="alert" className="rounded-xl border border-[var(--money-warning)] p-3 text-sm">
            <p className="font-medium">Corrigir uma fatura marcada como paga</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              A fatura volta a ser {STATUS_LABEL[target].toLowerCase()} e a data de pagamento é limpa. Nenhum lançamento, valor ou histórico é apagado, e o saldo disponível não é alterado.
            </p>
            <label className="mt-2 flex items-start gap-2 text-xs">
              <input type="checkbox" className="mt-0.5" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
              <span>Entendi e quero corrigir a situação desta fatura.</span>
            </label>
          </div>
        )}

        <ErrorText message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonSecondary} onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className={buttonPrimary}
            disabled={blocked}
            onClick={async () => {
              const ok = await run(() => financeCash.changeInvoiceStatus(invoice.id, target, { paidOn, deductFromBalance: markingPaid && moveBalance }));
              if (ok) onClose();
            }}
          >
            {pending ? 'Salvando…' : changingDate ? 'Salvar data' : 'Confirmar'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

'use client';

import { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Pencil } from 'lucide-react';
import { useCommands } from '@/providers/repository.provider';
import type { Balance } from '@/modules/finance/cash/domain/types';
import {
  Card, Dialog, ErrorText, Eyebrow, Money, MoneyField, buttonGhost, buttonPrimary, buttonSecondary,
  formatDateTimeBR, parseMoneyInput, centsToInput, useAction, Field, inputClass,
} from './ui';

export function AvailableBalanceCard({ balance }: { balance: Balance }) {
  const { financeCash } = useCommands();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const { pending, error, run, clearError } = useAction();

  const open = () => {
    setValue(centsToInput(balance.availableCents));
    clearError();
    setEditing(true);
  };
  const parsed = parseMoneyInput(value);

  return (
    <Card aria-label="Saldo disponível">
      <div className="flex items-start justify-between gap-3">
        <Eyebrow>Saldo disponível</Eyebrow>
        <button type="button" onClick={open} className={buttonGhost}><Pencil size={13} /> Atualizar</button>
      </div>
      <div className="mt-1">
        <Money cents={balance.availableCents} size="xl" tone={balance.availableCents < 0 ? 'negative' : 'default'} />
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        {balance.availableUpdatedAt
          ? `Informado por você em ${formatDateTimeBR(balance.availableUpdatedAt)}.`
          : 'Ainda não informado — toque em Atualizar e digite quanto há na conta.'}
      </p>
      <Dialog open={editing} title="Atualizar saldo disponível" onClose={() => setEditing(false)}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (parsed === null) return;
            if (await run(() => financeCash.setBalance({ availableCents: parsed }).then(() => undefined))) setEditing(false);
          }}
        >
          <MoneyField label="Quanto há disponível agora" value={value} onChange={setValue} allowNegative />
          <p className="rounded-lg bg-[var(--surface)] p-3 text-xs text-[var(--text-muted)]">
            Este valor é uma foto de agora. Recebimentos e contas que você marcar como feitos <strong>depois</strong> desta
            atualização podem ajustar o saldo; se você já considerou esses valores aqui, não os some de novo.
          </p>
          <ErrorText message={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className={buttonSecondary} onClick={() => setEditing(false)}>Cancelar</button>
            <button type="submit" className={buttonPrimary} disabled={pending || parsed === null}>{pending ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}

export function ReserveCard({ balance }: { balance: Balance }) {
  const { financeCash } = useCommands();
  const [mode, setMode] = useState<null | 'edit' | 'withdraw' | 'deposit'>(null);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const { pending, error, run, clearError } = useAction();
  const parsed = parseMoneyInput(value);

  const openMode = (m: 'edit' | 'withdraw' | 'deposit') => {
    setValue(m === 'edit' ? centsToInput(balance.reserveCents) : '');
    setNote('');
    setRequestId(crypto.randomUUID());
    clearError();
    setMode(m);
  };

  const title = mode === 'edit' ? 'Atualizar reserva' : mode === 'withdraw' ? 'Retirar da reserva' : 'Guardar na reserva';

  return (
    <Card aria-label="Reserva protegida">
      <div className="flex items-start justify-between gap-3">
        <Eyebrow>Reserva protegida</Eyebrow>
        <button type="button" onClick={() => openMode('edit')} className={buttonGhost}><Pencil size={13} /> Atualizar</button>
      </div>
      <div className="mt-1"><Money cents={balance.reserveCents} size="lg" /></div>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Separada do disponível: não entra no cálculo de cobertura.
        {balance.reserveUpdatedAt ? ` Atualizada em ${formatDateTimeBR(balance.reserveUpdatedAt)}.` : ''}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={buttonSecondary} onClick={() => openMode('withdraw')} disabled={balance.reserveCents <= 0}>
          <ArrowDownToLine size={15} /> Retirar
        </button>
        <button type="button" className={buttonSecondary} onClick={() => openMode('deposit')}>
          <ArrowUpFromLine size={15} /> Guardar
        </button>
      </div>

      <Dialog open={mode !== null} title={title} onClose={() => setMode(null)}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (parsed === null || mode === null) return;
            const ok = await run(async () => {
              if (mode === 'edit') await financeCash.setBalance({ reserveCents: parsed });
              else {
                await financeCash.transfer({
                  direction: mode === 'withdraw' ? 'reserve_to_available' : 'available_to_reserve',
                  amountCents: parsed, note: note || undefined, requestId,
                });
              }
            });
            if (ok) setMode(null);
          }}
        >
          <MoneyField label={mode === 'edit' ? 'Valor da reserva' : 'Valor da transferência'} value={value} onChange={setValue} />
          {mode !== 'edit' && (
            <>
              <p className="rounded-lg bg-[var(--surface)] p-3 text-xs text-[var(--text-muted)]">
                {mode === 'withdraw'
                  ? 'A reserva diminui e o saldo disponível aumenta no mesmo valor. Não é receita.'
                  : 'O saldo disponível diminui e a reserva aumenta no mesmo valor. Não é despesa.'}
              </p>
              <Field label="Observação (opcional)">
                {(id) => <input id={id} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />}
              </Field>
            </>
          )}
          <ErrorText message={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className={buttonSecondary} onClick={() => setMode(null)}>Cancelar</button>
            <button type="submit" className={buttonPrimary} disabled={pending || parsed === null || parsed < 0 || (mode !== 'edit' && parsed === 0)}>
              {pending ? 'Salvando…' : 'Confirmar'}
            </button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}

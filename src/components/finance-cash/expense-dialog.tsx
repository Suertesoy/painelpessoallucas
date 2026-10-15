'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useCommands } from '@/providers/repository.provider';
import { todayDateStr } from '@/lib/dates';
import { centsToBRL } from '@/modules/finance/domain/money';
import type { Category } from '@/modules/finance/cash/domain/categories';
import { isAmbiguousMerchant, type CategoryRule } from '@/modules/finance/cash/domain/category-rules';
import { merchantKey } from '@/modules/finance/cash/domain/categories';
import { PAYMENT_METHODS, suggestExpenseCategory, type ExpensePayment } from '@/modules/finance/cash/domain/expenses';
import type { LearnMode } from '@/modules/finance/cash/application/finance-cash.commands';
import type { Expense } from '@/modules/finance/cash/domain/types';
import { Dialog, ErrorText, Field, MoneyField, buttonPrimary, buttonSecondary, inputClass, parseMoneyInput, useAction } from './ui';

const NEW_CATEGORY = '__new__';

/**
 * Registro rápido de um gasto fora do cartão (Pix, débito, dinheiro):
 * Descrição → Valor → Data → Forma de pagamento → Categoria → Salvar.
 * A data começa em hoje. É um gasto JÁ PAGO: não cria compromisso futuro; por
 * padrão desconta do saldo disponível (desmarque se você já atualizou o saldo).
 */
export function RegisterExpenseButton({ categories, persistedCategories, expenses, rules, label = 'Registrar gasto' }: {
  categories: Category[]; persistedCategories: boolean; expenses: Expense[]; rules: CategoryRule[]; label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={buttonPrimary} onClick={() => setOpen(true)}>
        <Plus size={16} /> {label}
      </button>
      {open && (
        <Dialog open title="Registrar gasto" onClose={() => setOpen(false)}>
          <ExpenseForm categories={categories} persistedCategories={persistedCategories} expenses={expenses} rules={rules} onDone={() => setOpen(false)} />
        </Dialog>
      )}
    </>
  );
}

function ExpenseForm({ categories, persistedCategories, expenses, rules, onDone }: {
  categories: Category[]; persistedCategories: boolean; expenses: Expense[]; rules: CategoryRule[]; onDone: () => void;
}) {
  const { financeCash } = useCommands();
  const { pending, error, run } = useAction();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [spentOn, setSpentOn] = useState(() => todayDateStr());
  const [method, setMethod] = useState<ExpensePayment>('pix');
  const [chosen, setChosen] = useState<string | null>(null); // null = ainda não escolhi (vale a sugestão)
  const [newName, setNewName] = useState('');
  const [deduct, setDeduct] = useState(true);
  const [learn, setLearn] = useState(false);
  const [learnMode, setLearnMode] = useState<LearnMode>('amount');

  const cents = parseMoneyInput(amount);
  const suggestion = useMemo(
    () => (description.trim() && cents && cents > 0 ? suggestExpenseCategory(description, cents, expenses, rules, categories) : null),
    [description, cents, expenses, rules, categories]
  );
  const category = chosen !== null ? (chosen === '' || chosen === NEW_CATEGORY ? null : chosen) : (suggestion?.category ?? null);
  const creating = chosen === NEW_CATEGORY;
  const ambiguous = isAmbiguousMerchant(merchantKey(description));
  const valid = description.trim().length > 0 && cents !== null && cents > 0 && /^\d{4}-\d{2}-\d{2}$/.test(spentOn) && (!creating || newName.trim().length >= 2);

  async function save() {
    const ok = await run(async () => {
      let categoryId = category;
      if (creating) categoryId = await financeCash.createCategory(newName);
      await financeCash.recordExpense(
        { description, amountCents: cents as number, spentOn, paymentMethod: method, category: categoryId, deductFromBalance: deduct },
        learn && categoryId ? learnMode : undefined
      );
    });
    if (ok) onDone();
  }

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) void save(); }}>
      <Field label="Descrição">
        {(id) => <input id={id} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Corte de cabelo" maxLength={200} autoFocus required />}
      </Field>
      <MoneyField label="Valor" value={amount} onChange={setAmount} />
      <Field label="Data">
        {(id) => <input id={id} type="date" className={inputClass} value={spentOn} onChange={(e) => setSpentOn(e.target.value)} required />}
      </Field>

      <fieldset className="space-y-1">
        <legend className="text-xs font-medium text-[var(--text-muted)]">Forma de pagamento</legend>
        <div className="grid grid-cols-2 gap-2">
          {PAYMENT_METHODS.map((m) => (
            <label key={m.id} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm font-medium ${method === m.id ? 'border-[var(--accent)] bg-[var(--surface-raised)]' : 'border-[var(--line-strong)]'}`}>
              <input type="radio" name="payment" className="sr-only" checked={method === m.id} onChange={() => setMethod(m.id)} />
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Categoria" hint={chosen === null && suggestion ? `Sugestão pelo seu ${suggestion.source === 'rule' ? 'regra aprendida' : 'histórico'}.` : undefined}>
        {(id) => (
          <select id={id} className={inputClass} value={chosen === null ? (suggestion?.category ?? '') : chosen} onChange={(e) => setChosen(e.target.value)}>
            <option value="">Sem categoria</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            {persistedCategories && <option value={NEW_CATEGORY}>+ Nova categoria…</option>}
          </select>
        )}
      </Field>
      {creating && (
        <Field label="Nome da nova categoria">
          {(id) => <input id={id} className={inputClass} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex.: Cuidados pessoais" maxLength={40} autoFocus />}
        </Field>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={deduct} onChange={(e) => setDeduct(e.target.checked)} />
        <span>
          Descontar do saldo disponível
          <span className="block text-xs text-[var(--text-muted)]">Desmarque se você já atualizou o saldo depois deste gasto.</span>
        </span>
      </label>

      {category && (
        <div className="space-y-2">
          <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--text-muted)]">
            <input type="checkbox" checked={learn} onChange={(e) => setLearn(e.target.checked)} />
            Usar esta categoria em lançamentos semelhantes
          </label>
          {learn && (
            <div className="space-y-1 rounded-xl border border-[var(--line)] p-3 text-sm">
              <label className="flex min-h-11 items-center gap-2">
                <input type="radio" name="learn-mode" checked={learnMode === 'amount'} onChange={() => setLearnMode('amount')} />
                Mesmo nome e mesmo valor{cents ? ` (${centsToBRL(cents)})` : ''} <span className="text-[var(--text-muted)]">— recomendado</span>
              </label>
              <label className="flex min-h-11 items-center gap-2">
                <input type="radio" name="learn-mode" checked={learnMode === 'merchant'} onChange={() => setLearnMode('merchant')} />
                Qualquer valor com este nome
              </label>
              {learnMode === 'merchant' && ambiguous && <p className="text-[var(--money-warning)]">Este nome cobra serviços diferentes: valer para qualquer valor pode classificar errado.</p>}
            </div>
          )}
        </div>
      )}

      <ErrorText message={error} />
      <div className="flex justify-end gap-2">
        <button type="button" className={buttonSecondary} onClick={onDone}>Cancelar</button>
        <button type="submit" className={buttonPrimary} disabled={!valid || pending}>{pending ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </form>
  );
}

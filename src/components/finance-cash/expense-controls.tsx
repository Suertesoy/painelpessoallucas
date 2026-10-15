'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useCommands } from '@/providers/repository.provider';
import { centsToBRL } from '@/modules/finance/domain/money';
import { resolveCategoryId, type Category } from '@/modules/finance/cash/domain/categories';
import { paymentLabel } from '@/modules/finance/cash/domain/expenses';
import type { Expense } from '@/modules/finance/cash/domain/types';
import { Dialog, ErrorText, buttonGhost, buttonPrimary, buttonSecondary, useAction } from './ui';

const selectClass =
  'min-h-11 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-inset)] px-2 py-2 text-[var(--foreground)] max-w-full';

/** Categoria e exclusão de um gasto pontual (Pix, débito, dinheiro). Uma categoria só por gasto. */
export function ExpenseControls({ expense, categories }: { expense: Expense; categories: Category[] }) {
  const { financeCash } = useCommands();
  const { pending, error, run } = useAction();
  const [confirming, setConfirming] = useState(false);
  const [restore, setRestore] = useState(true);
  const current = resolveCategoryId(expense.category, categories);

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs text-[var(--text-muted)]">{paymentLabel(expense.paymentMethod)}</span>
        <select
          aria-label={`Categoria de ${expense.description}`}
          className={selectClass}
          value={current ?? ''}
          disabled={pending}
          onChange={(e) => void run(() => financeCash.setExpenseCategory(expense.id, e.target.value || null))}
        >
          <option value="">Sem categoria</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <button type="button" className={buttonGhost} aria-label={`Excluir gasto ${expense.description}`} onClick={() => { setRestore(true); setConfirming(true); }}>
          <Trash2 size={14} /> Excluir
        </button>
      </div>
      <ErrorText message={error} />

      <Dialog open={confirming} title="Excluir gasto" onClose={() => setConfirming(false)}>
        <div className="space-y-4">
          <p className="text-sm">{expense.description} · {centsToBRL(expense.amountCents)}</p>
          {expense.deductedFromBalance && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={restore} onChange={(e) => setRestore(e.target.checked)} />
              <span>
                Devolver {centsToBRL(expense.amountCents)} ao saldo disponível
                <span className="block text-xs text-[var(--text-muted)]">Foi descontado quando o gasto foi registrado. Desmarque se você já corrigiu o saldo.</span>
              </span>
            </label>
          )}
          <ErrorText message={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className={buttonSecondary} onClick={() => setConfirming(false)}>Cancelar</button>
            <button
              type="button"
              className={buttonPrimary}
              disabled={pending}
              onClick={async () => { if (await run(() => financeCash.deleteExpense(expense.id, expense.deductedFromBalance && restore))) setConfirming(false); }}
            >
              Excluir gasto
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

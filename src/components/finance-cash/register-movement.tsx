'use client';

import { useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, CalendarClock, Plus, Repeat, ChevronLeft } from 'lucide-react';
import type { Category } from '@/modules/finance/cash/domain/categories';
import type { CategoryRule } from '@/modules/finance/cash/domain/category-rules';
import type { Expense } from '@/modules/finance/cash/domain/types';
import type { MonthKey } from '@/modules/finance/cash/domain/month';
import { ExpenseForm } from './expense-dialog';
import { ReceivableForm, FixedIncomeForm } from './receivables-section';
import { CommitmentForm } from './commitments-section';
import { Dialog, buttonPrimary } from './ui';

type Kind = 'income_once' | 'expense_once' | 'income_recurring' | 'bill';

const OPTIONS: { kind: Kind; title: string; effect: string; icon: typeof Plus }[] = [
  {
    kind: 'income_once',
    title: 'Entrada pontual',
    effect: 'Dinheiro que vai entrar uma vez. Só soma ao saldo quando você marcar “Recebi”.',
    icon: ArrowDownCircle,
  },
  {
    kind: 'expense_once',
    title: 'Saída pontual',
    effect: 'Gasto que já foi pago. Você escolhe se abate do saldo disponível agora.',
    icon: ArrowUpCircle,
  },
  {
    kind: 'income_recurring',
    title: 'Entrada recorrente',
    effect: 'Receita que se repete todo mês. Fica como prevista até você marcar “Recebi”.',
    icon: Repeat,
  },
  {
    kind: 'bill',
    title: 'Conta ou compromisso',
    effect: 'Recorrente ou a vencer. Não muda o saldo até você marcar “Paguei”.',
    icon: CalendarClock,
  },
];

const TITLES: Record<Kind, string> = {
  income_once: 'Nova entrada pontual',
  expense_once: 'Nova saída pontual',
  income_recurring: 'Nova entrada recorrente',
  bill: 'Nova conta ou compromisso',
};

/**
 * Ponto único para registrar movimentações. Escolhe-se o tipo e aparece só o
 * formulário correspondente (os mesmos já usados e validados antes — nada de
 * tabelas ou comandos duplicados). Cada opção diz se mexe ou não no saldo,
 * para não contar um movimento duas vezes.
 */
export function RegisterMovementButton({ categories, persistedCategories, expenses, rules, currentMonth }: {
  categories: Category[]; persistedCategories: boolean; expenses: Expense[]; rules: CategoryRule[]; currentMonth: MonthKey;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind | null>(null);
  const close = () => {
    setOpen(false);
    setKind(null);
  };

  return (
    <>
      <button type="button" className={`${buttonPrimary} min-h-12 px-5 text-base`} onClick={() => setOpen(true)}>
        <Plus size={18} /> Registrar movimentação
      </button>
      {open && (
        <Dialog open title={kind ? TITLES[kind] : 'Registrar movimentação'} onClose={close}>
          {!kind && (
            <ul className="space-y-2" aria-label="Tipo de movimentação">
              {OPTIONS.map(({ kind: k, title, effect, icon: Icon }) => (
                <li key={k}>
                  <button
                    type="button"
                    onClick={() => setKind(k)}
                    className="flex min-h-16 w-full items-start gap-3 rounded-2xl border border-[var(--line-strong)] bg-[var(--surface)] p-3 text-left hover:border-[var(--text-muted)]"
                  >
                    <Icon size={22} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                    <span>
                      <span className="block text-sm font-semibold">{title}</span>
                      <span className="block text-xs text-[var(--text-muted)]">{effect}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {kind && (
            <div>
              <button type="button" onClick={() => setKind(null)} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-[var(--accent)]">
                <ChevronLeft size={16} /> Trocar tipo
              </button>
              {kind === 'income_once' && <ReceivableForm onDone={close} onCancel={close} />}
              {kind === 'expense_once' && (
                <ExpenseForm categories={categories} persistedCategories={persistedCategories} expenses={expenses} rules={rules} onDone={close} />
              )}
              {kind === 'income_recurring' && <FixedIncomeForm currentMonth={currentMonth} onDone={close} onCancel={close} />}
              {kind === 'bill' && <CommitmentForm currentMonth={currentMonth} onDone={close} onCancel={close} />}
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}

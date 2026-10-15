import type { Expense } from './types';
import { merchantKey, type Category } from './categories';
import { findRule, type CategoryRule } from './category-rules';
import { monthOf } from './month';
import type { SpendingRow } from './spending';

/** Formas de pagamento das despesas pontuais (fora do cartão). */
export const PAYMENT_METHODS = [
  { id: 'pix', label: 'Pix' },
  { id: 'debit', label: 'Débito' },
  { id: 'cash', label: 'Dinheiro' },
  { id: 'other', label: 'Outro' },
] as const;

export type ExpensePayment = (typeof PAYMENT_METHODS)[number]['id'];

export const paymentLabel = (id: string): string => PAYMENT_METHODS.find((p) => p.id === id)?.label ?? id;

/**
 * Linha de gasto de uma despesa pontual para as análises mensais. Só conta
 * `kind = 'expense'`: transferências internas e pagamentos de fatura (preparo
 * para a futura conciliação de extratos) nunca entram como gasto. O mês é o da
 * data do gasto; a despesa não tem cartão.
 */
export function expenseToSpendingRow(e: Expense): SpendingRow | null {
  if (e.kind !== 'expense') return null;
  return {
    id: e.id, card: null, invoiceMonth: monthOf(e.spentOn), date: e.spentOn, description: e.description,
    baseDescription: e.description, amountCents: e.amountCents, kind: 'purchase', status: 'active',
    category: e.category, purpose: null, source: 'expense', paymentMethod: e.paymentMethod,
  };
}

export interface ExpenseCategorySuggestion {
  category: string;
  source: 'rule' | 'history';
}

/**
 * Sugestão de categoria para um gasto que está sendo digitado, só com o que
 * você já fez: (1) uma regra aprendida (estabelecimento + valor, ou só o
 * estabelecimento se você autorizou); (2) o histórico do mesmo nome, se for
 * consistente. Nada é inventado: sem base, sem sugestão. A categoria sugerida
 * precisa existir hoje na lista do workspace.
 */
export function suggestExpenseCategory(
  description: string,
  amountCents: number,
  expenses: readonly Expense[],
  rules: readonly CategoryRule[],
  categories: readonly Category[]
): ExpenseCategorySuggestion | null {
  const key = merchantKey(description);
  if (!key) return null;
  const exists = (id: string | null): id is string => id !== null && categories.some((c) => c.id === id);
  const rule = findRule({ baseDescription: description, amountCents }, rules);
  if (rule && exists(rule.category)) return { category: rule.category, source: 'rule' };
  const used = new Set(
    expenses.filter((e) => e.kind === 'expense' && merchantKey(e.description) === key && exists(e.category)).map((e) => e.category as string)
  );
  return used.size === 1 ? { category: [...used][0], source: 'history' } : null;
}

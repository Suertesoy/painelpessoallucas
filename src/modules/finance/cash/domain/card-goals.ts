import { compareMonths, type MonthKey } from './month';

/**
 * Meta mensal CONJUNTA dos cartões (Lucas e Matheus escolhem juntos).
 *
 * Não é o limite sustentável calculado pelo app e nunca altera faturas, saldos
 * nem lançamentos: é só uma referência manual para acompanhar o mês.
 *
 * Duas formas de guardar, por workspace:
 *  - 'default': meta padrão A PARTIR de um mês (vale até outra meta padrão em mês posterior);
 *  - 'month': exceção só daquele mês.
 * Valor efetivo de um mês: exceção do mês → meta padrão mais recente até o mês → nenhuma.
 * Nenhum valor inicial é inventado: sem meta definida a tela mostra "Definir nossa meta mensal".
 */

export type CardGoalScope = 'default' | 'month';

export interface CardGoal {
  id: string;
  scope: CardGoalScope;
  month: MonthKey;
  amountCents: number;
  updatedAt: string | null;
}

export interface ResolvedCardGoal {
  amountCents: number;
  /** 'month' = exceção deste mês; 'default' = meta padrão herdada. */
  source: CardGoalScope;
  /** Mês em que a meta padrão começou a valer (só para 'default'). */
  since: MonthKey | null;
}

export function resolveCardGoal(goals: readonly CardGoal[], month: MonthKey): ResolvedCardGoal | null {
  const exception = goals.find((g) => g.scope === 'month' && g.month === month);
  if (exception) return { amountCents: exception.amountCents, source: 'month', since: null };
  const defaults = goals
    .filter((g) => g.scope === 'default' && compareMonths(g.month, month) <= 0)
    .sort((a, b) => compareMonths(b.month, a.month));
  const latest = defaults[0];
  return latest ? { amountCents: latest.amountCents, source: 'default', since: latest.month } : null;
}

/** Há uma meta padrão (a partir de algum mês) que vale para `month`? */
export function hasDefaultGoal(goals: readonly CardGoal[], month: MonthKey): boolean {
  return goals.some((g) => g.scope === 'default' && compareMonths(g.month, month) <= 0);
}

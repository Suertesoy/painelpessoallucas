import { isTechOrProfessional } from './categories';
import type { CardId, MonthKey } from './month';

/**
 * Consulta de gastos por categoria/finalidade sobre lançamentos de fatura.
 * Soma valores como estão na fatura (compras + estornos/ajustes); pagamentos
 * de fatura e lançamentos removidos nunca entram. Só leitura: nada aqui
 * altera valores.
 */

export interface SpendingRow {
  id: string;
  card: CardId;
  invoiceMonth: MonthKey;
  date: string;
  description: string;
  amountCents: number;
  kind: 'purchase' | 'refund' | 'payment' | 'adjustment';
  status: 'active' | 'missing' | 'removed';
  category: string | null;
  purpose: string | null;
}

export interface SpendingFilter {
  month: MonthKey | '';
  card: CardId | '';
  /** '' = todas; 'none' = sem categoria; ou um id de categoria. */
  category: string;
  /** '' = todas; 'none' = não classificada; ou um id de finalidade. */
  purpose: string;
  /** Atalho: categorias de tecnologia OU finalidade profissional. */
  techOrProfessional: boolean;
}

export const EMPTY_FILTER: SpendingFilter = { month: '', card: '', category: '', purpose: '', techOrProfessional: false };

export function filterSpending(rows: readonly SpendingRow[], f: SpendingFilter): SpendingRow[] {
  return rows.filter((r) => {
    if (r.kind === 'payment' || r.status === 'removed') return false;
    if (f.month && r.invoiceMonth !== f.month) return false;
    if (f.card && r.card !== f.card) return false;
    if (f.category === 'none' ? r.category !== null : f.category && r.category !== f.category) return false;
    if (f.purpose === 'none' ? r.purpose !== null : f.purpose && r.purpose !== f.purpose) return false;
    if (f.techOrProfessional && !isTechOrProfessional(r)) return false;
    return true;
  });
}

export interface Group {
  key: string;
  cents: number;
  count: number;
}

function groupBy(rows: readonly SpendingRow[], keyOf: (r: SpendingRow) => string): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const key = keyOf(r);
    const g = map.get(key) ?? { key, cents: 0, count: 0 };
    g.cents += r.amountCents;
    g.count += 1;
    map.set(key, g);
  }
  return [...map.values()];
}

export interface SpendingSummary {
  totalCents: number;
  count: number;
  unclassifiedCount: number;
  unclassifiedCents: number;
  byCategory: Group[];
  byPurpose: Group[];
  byCard: Group[];
  byMonth: Group[];
}

export function summarizeSpending(rows: readonly SpendingRow[]): SpendingSummary {
  const byValueDesc = (a: Group, b: Group) => b.cents - a.cents;
  const unclassified = rows.filter((r) => r.category === null || r.purpose === null);
  return {
    totalCents: rows.reduce((s, r) => s + r.amountCents, 0),
    count: rows.length,
    unclassifiedCount: unclassified.length,
    unclassifiedCents: unclassified.reduce((s, r) => s + r.amountCents, 0),
    byCategory: groupBy(rows, (r) => r.category ?? 'none').sort(byValueDesc),
    byPurpose: groupBy(rows, (r) => r.purpose ?? 'none').sort(byValueDesc),
    byCard: groupBy(rows, (r) => r.card).sort(byValueDesc),
    byMonth: groupBy(rows, (r) => r.invoiceMonth).sort((a, b) => a.key.localeCompare(b.key)),
  };
}

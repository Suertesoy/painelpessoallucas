'use client';

import { useMemo, useState } from 'react';
import { centsToBRL } from '@/modules/finance/domain/money';
import type { FinanceTransaction, FinanceNature } from '@/modules/finance/domain/finance-transaction.schema';
import type { FinanceCategory } from '@/modules/finance/domain/finance-category.schema';
import type { FinanceSource } from '@/modules/finance/domain/finance-source.schema';

const NATURE_LABELS: Record<FinanceNature, string> = {
  purchase: 'Compra',
  fee: 'Tarifa',
  transfer: 'Transferência',
  invoice_payment: 'Pagamento de fatura',
  refund: 'Estorno',
  unidentified_credit: 'Crédito não identificado',
  ignored: 'Ignorado',
};

function formatTransactionDate(dateStr: string): string {
  // `transaction_date` já vem como YYYY-MM-DD puro (coluna `date` do
  // Postgres) — exibido diretamente, sem passar por Date/UTC.
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/** Lista de transações confirmadas com filtros por categoria, natureza, origem e busca. */
export function FinanceTransactionsList({
  transactions,
  categories,
  sources,
}: {
  transactions: FinanceTransaction[];
  categories: FinanceCategory[];
  sources: FinanceSource[];
}) {
  const [categoryFilter, setCategoryFilter] = useState('');
  const [natureFilter, setNatureFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [search, setSearch] = useState('');

  const categoryNameById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const sourceNameById = useMemo(() => new Map(sources.map((s) => [s.id, s.name])), [sources]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (categoryFilter && t.categoryId !== categoryFilter) return false;
      if (natureFilter && t.nature !== natureFilter) return false;
      if (sourceFilter && t.sourceId !== sourceFilter) return false;
      if (term && !t.description.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [transactions, categoryFilter, natureFilter, sourceFilter, search]);

  return (
    <section aria-label="Transações confirmadas" className="mt-6">
      <h2 className="text-sm font-semibold text-gray-800">Transações confirmadas</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filtrar por categoria"
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
        >
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={natureFilter}
          onChange={(e) => setNatureFilter(e.target.value)}
          aria-label="Filtrar por natureza"
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
        >
          <option value="">Todas as naturezas</option>
          {(Object.keys(NATURE_LABELS) as FinanceNature[]).map((n) => (
            <option key={n} value={n}>
              {NATURE_LABELS[n]}
            </option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          aria-label="Filtrar por origem"
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
        >
          <option value="">Todas as origens</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por descrição…"
          aria-label="Buscar transações por descrição"
          className="min-w-[10rem] flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">Nenhuma transação confirmada encontrada com esses filtros.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {filtered.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-gray-800">{t.description}</p>
                <p className="text-xs text-gray-500">
                  {formatTransactionDate(t.transactionDate)} · {categoryNameById.get(t.categoryId) ?? 'Categoria removida'} ·{' '}
                  {NATURE_LABELS[t.nature]} · {sourceNameById.get(t.sourceId) ?? 'Origem removida'}
                </p>
              </div>
              <span className={`shrink-0 font-medium ${t.amountCents < 0 ? 'text-gray-800' : 'text-green-700'}`}>
                {centsToBRL(t.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

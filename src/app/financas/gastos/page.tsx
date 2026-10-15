'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useQueries } from '@/providers/repository.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import { todayDateStr } from '@/lib/dates';
import { monthLabel, monthOf } from '@/modules/finance/cash/domain/month';
import { EMPTY_FILTER, type SpendingRow } from '@/modules/finance/cash/domain/spending';
import { breakdownSpending } from '@/modules/finance/cash/domain/spending-groups';
import { ClassificationError, ClassifierControls, useClassification } from '@/components/finance-cash/item-classifier';
import { DonutChart, sliceColor } from '@/components/finance-cash/donut-chart';
import { LearnedRules } from '@/components/finance-cash/learned-rules';
import { Card, Money, buttonSecondary, formatDateBR, inputClass } from '@/components/finance-cash/ui';

function pct(part: number, total: number): string {
  return total > 0 && part > 0 ? `${Math.round((part / total) * 100)}%` : '';
}

function Gastos() {
  const params = useSearchParams();
  const { financeCash } = useQueries();
  const today = useMemo(() => todayDateStr(), []);
  const { data, isLoading, error, isOffline, refetch } = useReactiveQuery(() => financeCash.getSnapshot(today), [today]);

  const [monthChoice, setMonthChoice] = useState<string | null>(null);
  const [onlyTech, setOnlyTech] = useState(params.get('preset') === 'tech');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [merchant, setMerchant] = useState<string | null>(null);

  const invoiceById = useMemo(() => new Map((data?.invoices ?? []).map((i) => [i.id, i])), [data?.invoices]);
  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const rows = useMemo<SpendingRow[]>(
    () => items.flatMap((it) => {
      const inv = invoiceById.get(it.invoiceId);
      return inv ? [{
        id: it.id, card: inv.card, invoiceMonth: inv.month, date: it.date, description: it.description, baseDescription: it.baseDescription,
        amountCents: it.amountCents, kind: it.kind, status: it.status, category: it.category, purpose: it.purpose,
      }] : [];
    }),
    [items, invoiceById]
  );

  const months = useMemo(() => [...new Set(rows.map((r) => r.invoiceMonth))].sort(), [rows]);
  // Padrão: o mês atual se tiver gastos; senão o mais recente com gastos.
  const defaultMonth = months.includes(monthOf(today)) ? monthOf(today) : (months[months.length - 1] ?? '');
  const month = monthChoice ?? defaultMonth;

  const breakdown = useMemo(
    () => breakdownSpending(rows, { ...EMPTY_FILTER, month, techOrProfessional: onlyTech }, data?.customCategories ?? []),
    [rows, month, onlyTech, data?.customCategories]
  );
  const classification = useClassification(items, {
    customCategories: data?.customCategories ?? [],
    rules: data?.categoryRules ?? [],
  });

  const selected = breakdown.categories.find((c) => c.id === categoryId) ?? null;
  const selectedMerchant = selected?.merchants.find((m) => m.name === merchant) ?? null;
  const positiveTotal = breakdown.categories.reduce((s, c) => s + Math.max(c.cents, 0), 0);

  const uncategorized = breakdown.categories.find((c) => c.id === 'none');
  const uncategorizedItems = (uncategorized?.merchants.flatMap((m) => m.rows) ?? [])
    .map((r) => itemById.get(r.id))
    .filter((i): i is NonNullable<typeof i> => Boolean(i));
  const withSuggestion = uncategorizedItems.filter((i) => classification.suggestionFor(i) !== null);

  const chooseCategory = (id: string) => {
    setCategoryId(id === categoryId ? null : id);
    setMerchant(null);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-24 md:p-8">
      <Link href="/financas" className="inline-flex min-h-11 items-center gap-1 text-sm text-[var(--accent)]"><ArrowLeft size={14} /> Finanças</Link>
      <header>
        <h1 className="text-2xl font-bold">Para onde vai nosso dinheiro?</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Gastos das faturas dos cartões. Categorias são só rótulos: não mudam nenhum valor.</p>
      </header>

      {error && <DataErrorNotice isOffline={isOffline} onRetry={refetch} />}
      {!error && isLoading && !data && <p className="text-sm text-[var(--text-muted)]">Carregando…</p>}

      {!error && data && rows.length === 0 && (
        <Card><p className="text-sm text-[var(--text-muted)]">Nenhum lançamento importado ainda. Importe uma fatura em Finanças.</p></Card>
      )}

      {!error && data && rows.length > 0 && (
        <>
          <Card aria-label="Gastos do mês">
            <label className="block text-sm font-medium" htmlFor="gastos-mes">Fatura de</label>
            <select
              id="gastos-mes"
              className={`${inputClass} mt-1 capitalize`}
              value={month}
              onChange={(e) => { setMonthChoice(e.target.value); setCategoryId(null); setMerchant(null); }}
            >
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>

            {breakdown.count === 0 ? (
              <p className="mt-4 text-sm text-[var(--text-muted)]">Nenhum gasto neste mês{onlyTech ? ' com esse filtro' : ''}.</p>
            ) : (
              <>
                <div className="mt-4">
                  <DonutChart
                    slices={breakdown.categories}
                    selectedId={categoryId}
                    onSelect={chooseCategory}
                    totalLabel="Total do mês"
                  />
                </div>
                <p className="mt-2 text-center text-xs text-[var(--text-muted)]">
                  {breakdown.count} lançamento{breakdown.count === 1 ? '' : 's'}.
                  {breakdown.uncategorizedCount > 0 && <> <Money cents={breakdown.uncategorizedCents} size="sm" tone="warning" /> ainda sem categoria.</>}
                </p>

                <ul className="mt-4 divide-y divide-[var(--line)]" aria-label="Categorias">
                  {breakdown.categories.map((c, i) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        aria-pressed={c.id === categoryId}
                        onClick={() => chooseCategory(c.id)}
                        className={`flex min-h-12 w-full items-center gap-3 px-1 py-2 text-left ${c.id === categoryId ? 'bg-[var(--surface-raised)]' : ''}`}
                      >
                        <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ background: sliceColor(c, i) }} />
                        <span className="min-w-0 flex-1 truncate text-sm">{c.label}</span>
                        <span className="text-xs text-[var(--text-muted)]">{pct(c.cents, positiveTotal)}</span>
                        <Money cents={c.cents} size="sm" />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <label className="mt-3 flex min-h-11 items-center gap-2 text-sm text-[var(--text-muted)]">
              <input type="checkbox" checked={onlyTech} onChange={(e) => { setOnlyTech(e.target.checked); setCategoryId(null); setMerchant(null); }} />
              Mostrar só gastos profissionais ou de tecnologia
            </label>
          </Card>

          {selected && (
            <Card aria-label={`Lojas em ${selected.label}`}>
              <h2 className="text-base font-semibold">{selected.label}</h2>
              <ul className="mt-2 divide-y divide-[var(--line)]">
                {selected.merchants.map((m) => (
                  <li key={m.name}>
                    <button
                      type="button"
                      aria-expanded={m.name === merchant}
                      onClick={() => setMerchant(m.name === merchant ? null : m.name)}
                      className="flex min-h-12 w-full items-center gap-3 px-1 py-2 text-left"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">{m.name} <span className="text-xs text-[var(--text-muted)]">({m.count})</span></span>
                      <Money cents={m.cents} size="sm" />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {selectedMerchant && (
            <Card aria-label={`Lançamentos de ${selectedMerchant.name}`}>
              <h2 className="text-base font-semibold">{selectedMerchant.name}</h2>
              <ClassificationError classification={classification} />
              <ul className="mt-2 divide-y divide-[var(--line)]">
                {selectedMerchant.rows.map((r) => {
                  const item = itemById.get(r.id);
                  return (
                    <li key={r.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm">{r.description}</p>
                          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{formatDateBR(r.date)}{r.status === 'missing' ? ' · ausente do último CSV' : ''}</p>
                        </div>
                        <Money cents={r.amountCents} size="sm" tone={r.amountCents < 0 ? 'positive' : 'default'} />
                      </div>
                      {item && <ClassifierControls item={item} classification={classification} />}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {uncategorizedItems.length > 0 && (
            <details className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
              <summary className="cursor-pointer p-4 text-base font-semibold">
                Revisar gastos sem categoria <span className="text-sm font-normal text-[var(--text-muted)]">({uncategorizedItems.length})</span>
              </summary>
              <div className="space-y-3 border-t border-[var(--line)] p-4">
                {withSuggestion.length > 0 && (
                  <button type="button" className={buttonSecondary} disabled={classification.pending} onClick={() => void classification.acceptMany(withSuggestion)}>
                    <Sparkles size={14} /> Aceitar {withSuggestion.length} sugest{withSuggestion.length === 1 ? 'ão' : 'ões'}
                  </button>
                )}
                <ClassificationError classification={classification} />
                <ul className="divide-y divide-[var(--line)]">
                  {uncategorizedItems.map((item) => (
                    <li key={item.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm">{item.description}</p>
                          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{formatDateBR(item.date)}</p>
                        </div>
                        <Money cents={item.amountCents} size="sm" />
                      </div>
                      <ClassifierControls item={item} classification={classification} />
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          )}

          <LearnedRules
            rules={data.categoryRules}
            customCategories={data.customCategories}
            labelFor={classification.labelFor}
          />
        </>
      )}
    </div>
  );
}

export default function GastosPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-[var(--text-muted)]">Carregando…</p>}>
      <Gastos />
    </Suspense>
  );
}

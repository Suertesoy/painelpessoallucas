'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useQueries } from '@/providers/repository.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import { todayDateStr } from '@/lib/dates';
import { CARD_FULL_LABELS, CARD_IDS, monthLabel, type CardId } from '@/modules/finance/cash/domain/month';
import { CATEGORIES, PURPOSES, categoryLabel, purposeLabel } from '@/modules/finance/cash/domain/categories';
import {
  EMPTY_FILTER, filterSpending, summarizeSpending, type Group, type SpendingFilter, type SpendingRow,
} from '@/modules/finance/cash/domain/spending';
import { ClassifierControls, SimilarToggle, useClassification } from '@/components/finance-cash/item-classifier';
import { Card, Chip, Eyebrow, Money, buttonGhost, buttonSecondary, formatDateBR, inputClass } from '@/components/finance-cash/ui';

function GroupList({ title, groups, label }: { title: string; groups: Group[]; label: (key: string) => string }) {
  if (groups.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-[var(--text-muted)]">{title}</p>
      <ul className="mt-1 divide-y divide-[var(--line)]">
        {groups.map((g) => (
          <li key={g.key} className="flex items-center justify-between gap-3 py-1.5 text-sm">
            <span className="min-w-0 truncate">{label(g.key)} <span className="text-xs text-[var(--text-muted)]">({g.count})</span></span>
            <Money cents={g.cents} size="sm" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Gastos() {
  const params = useSearchParams();
  const { financeCash } = useQueries();
  const today = useMemo(() => todayDateStr(), []);
  const { data, isLoading, error, isOffline, refetch } = useReactiveQuery(() => financeCash.getSnapshot(today), [today]);
  const [filter, setFilter] = useState<SpendingFilter>({ ...EMPTY_FILTER, techOrProfessional: params.get('preset') === 'tech' });

  const invoiceById = useMemo(() => new Map((data?.invoices ?? []).map((i) => [i.id, i])), [data?.invoices]);
  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const rows = useMemo<SpendingRow[]>(
    () => items.flatMap((it) => {
      const inv = invoiceById.get(it.invoiceId);
      return inv ? [{
        id: it.id, card: inv.card, invoiceMonth: inv.month, date: it.date, description: it.description,
        amountCents: it.amountCents, kind: it.kind, status: it.status, category: it.category, purpose: it.purpose,
      }] : [];
    }),
    [items, invoiceById]
  );

  const filtered = useMemo(() => filterSpending(rows, filter), [rows, filter]);
  const summary = useMemo(() => summarizeSpending(filtered), [filtered]);
  const months = useMemo(() => [...new Set((data?.invoices ?? []).map((i) => i.month))].sort(), [data?.invoices]);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const classification = useClassification(items);
  const visibleItems = filtered.map((r) => itemById.get(r.id)).filter((i): i is NonNullable<typeof i> => Boolean(i));
  const withSuggestion = visibleItems.filter((i) => classification.suggestionFor(i) !== null);

  const set = (patch: Partial<SpendingFilter>) => setFilter({ ...filter, ...patch });
  const isTech = filter.techOrProfessional;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-24 md:p-8">
      <Link href="/financas" className="inline-flex items-center gap-1 text-sm text-[var(--accent)]"><ArrowLeft size={14} /> Finanças</Link>
      <header>
        <h1 className="text-2xl font-bold">Gastos nas faturas</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Categoria e finalidade são só rótulos: não mudam nenhum valor.</p>
      </header>

      {error && <DataErrorNotice isOffline={isOffline} onRetry={refetch} />}
      {!error && isLoading && !data && <p className="text-sm text-[var(--text-muted)]">Carregando…</p>}

      {!error && data && (
        <>
          <Card>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={isTech ? 'rounded-xl border border-[var(--accent)] bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800' : buttonSecondary}
                aria-pressed={isTech} onClick={() => set({ techOrProfessional: !isTech })}>
                Tecnologia e profissional
              </button>
              <button type="button" className={filter.category === 'none' && filter.purpose === 'none' ? 'rounded-xl border border-[var(--accent)] bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800' : buttonSecondary}
                onClick={() => set(filter.category === 'none' && filter.purpose === 'none' ? { category: '', purpose: '' } : { category: 'none', purpose: 'none', techOrProfessional: false })}>
                Sem classificação
              </button>
              <button type="button" className={buttonGhost} onClick={() => setFilter(EMPTY_FILTER)}>Limpar filtros</button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <select aria-label="Mês da fatura" className={inputClass} value={filter.month} onChange={(e) => set({ month: e.target.value })}>
                <option value="">Todos os meses</option>
                {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
              <select aria-label="Cartão" className={inputClass} value={filter.card} onChange={(e) => set({ card: e.target.value as CardId | '' })}>
                <option value="">Todos os cartões</option>
                {CARD_IDS.map((c) => <option key={c} value={c}>{CARD_FULL_LABELS[c]}</option>)}
              </select>
              <select aria-label="Categoria" className={inputClass} value={filter.category} onChange={(e) => set({ category: e.target.value })}>
                <option value="">Todas as categorias</option>
                <option value="none">Sem categoria</option>
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <select aria-label="Finalidade" className={inputClass} value={filter.purpose} onChange={(e) => set({ purpose: e.target.value })}>
                <option value="">Todas as finalidades</option>
                <option value="none">Não classificada</option>
                {PURPOSES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          </Card>

          <Card aria-label="Resumo">
            <Eyebrow>{isTech ? 'Tecnologia e serviços profissionais' : 'Total do filtro'}</Eyebrow>
            <div className="mt-1 flex items-baseline gap-2">
              <Money cents={summary.totalCents} size="xl" />
              <span className="text-sm text-[var(--text-muted)]">{summary.count} lançamento{summary.count === 1 ? '' : 's'}</span>
            </div>
            {summary.unclassifiedCount > 0 && (
              <p className="mt-2 text-xs text-[var(--money-warning)]">
                {summary.unclassifiedCount} ainda sem categoria ou finalidade (<Money cents={summary.unclassifiedCents} size="sm" tone="warning" />).
              </p>
            )}
            {summary.count > 0 && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <GroupList title="Por categoria" groups={summary.byCategory} label={(k) => categoryLabel(k === 'none' ? null : k)} />
                <GroupList title="Por finalidade" groups={summary.byPurpose} label={(k) => purposeLabel(k === 'none' ? null : k)} />
                <GroupList title="Por cartão" groups={summary.byCard} label={(k) => CARD_FULL_LABELS[k as CardId]} />
                <GroupList title="Por mês da fatura" groups={summary.byMonth} label={(k) => monthLabel(k)} />
              </div>
            )}
          </Card>

          <Card aria-label="Lançamentos">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Eyebrow>Lançamentos ({filtered.length})</Eyebrow>
              {withSuggestion.length > 0 && (
                <button type="button" className={buttonSecondary} disabled={classification.pending} onClick={() => void classification.acceptMany(withSuggestion)}>
                  <Sparkles size={14} /> Aceitar {withSuggestion.length} sugest{withSuggestion.length === 1 ? 'ão' : 'ões'}
                </button>
              )}
            </div>
            <div className="mt-2"><SimilarToggle classification={classification} /></div>
            {filtered.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                {rows.length === 0 ? 'Nenhum lançamento importado ainda. Importe uma fatura em Finanças.' : 'Nenhum lançamento com esses filtros.'}
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--line)]">
                {filtered.map((r) => {
                  const item = itemById.get(r.id);
                  return (
                    <li key={r.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm">{r.description}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
                            {formatDateBR(r.date)}
                            <Chip>{CARD_FULL_LABELS[r.card]}</Chip>
                            <span className="capitalize">fatura {monthLabel(r.invoiceMonth)}</span>
                            {r.status === 'missing' && <Chip tone="warning">ausente do último CSV</Chip>}
                          </p>
                        </div>
                        <Money cents={r.amountCents} size="sm" tone={r.amountCents < 0 ? 'positive' : 'default'} />
                      </div>
                      {item && <ClassifierControls item={item} classification={classification} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
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

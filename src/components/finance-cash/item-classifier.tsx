'use client';

import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useCommands } from '@/providers/repository.provider';
import { centsToBRL } from '@/modules/finance/domain/money';
import type { InvoiceItem } from '@/modules/finance/cash/domain/types';
import {
  categoryLabel, merchantKey, resolveCategoryId, suggestClassification,
  type Category, type ClassificationSuggestion, type ClassifiableItem,
} from '@/modules/finance/cash/domain/categories';
import { describeRule, findRule, isAmbiguousMerchant, type CategoryRule } from '@/modules/finance/cash/domain/category-rules';
import type { LearnMode } from '@/modules/finance/cash/application/finance-cash.commands';
import { ErrorText, buttonGhost, buttonSecondary, useAction } from './ui';

const NEW_CATEGORY = '__new__';

export interface ClassificationContext {
  categories: Category[];
  rules: CategoryRule[];
}

/** Lógica compartilhada entre a tela da fatura e a página de gastos. Cada lançamento tem UMA categoria. */
export function useClassification(items: InvoiceItem[], context: ClassificationContext = { categories: [], rules: [] }) {
  const { financeCash } = useCommands();
  const { pending, error, run } = useAction();
  const { categories, rules } = context;

  const classifiable = useMemo<ClassifiableItem[]>(
    () => items.filter((i) => i.kind !== 'payment').map((i) => ({
      id: i.id, key: merchantKey(i.baseDescription), category: i.category, purpose: null,
    })),
    [items]
  );
  const byId = useMemo(() => new Map(classifiable.map((c) => [c.id, c])), [classifiable]);
  const categoryIds = useMemo(() => categories.map((c) => c.id), [categories]);

  const labelFor = (id: string | null) => categoryLabel(id, categories);

  /** Sugestão só de categoria, já resolvida para uma categoria que existe hoje (ids antigos viram o alias). */
  const suggestionFor = (item: InvoiceItem): ClassificationSuggestion | null => {
    const self = byId.get(item.id);
    if (!self) return null;
    const s = suggestClassification(self, classifiable, categoryIds);
    const resolved = s ? resolveCategoryId(s.category, categories) : null;
    return s && resolved ? { category: resolved, purpose: null, source: s.source } : null;
  };

  /** Classifica SÓ este lançamento (confirmação sua). Aprender com outros é opcional e separado. */
  const classify = (item: InvoiceItem, category: string | null) =>
    run(async () => {
      await financeCash.classifyItems({ itemIds: [item.id], category });
    });

  const accept = (item: InvoiceItem, s: ClassificationSuggestion) => (s.category ? classify(item, s.category) : Promise.resolve(false));

  /** Aceita as sugestões de vários itens de uma vez, agrupando por categoria. */
  const acceptMany = (rows: InvoiceItem[]) =>
    run(async () => {
      const groups = new Map<string, string[]>();
      for (const row of rows) {
        const category = suggestionFor(row)?.category;
        if (!category) continue;
        groups.set(category, [...(groups.get(category) ?? []), row.id]);
      }
      for (const [category, ids] of groups) await financeCash.classifyItems({ itemIds: ids, category });
    });

  /** Cria (ou reaproveita) a categoria e classifica o lançamento com ela. */
  const classifyWithNewCategory = (item: InvoiceItem, label: string) =>
    run(async () => {
      const id = await financeCash.createCategory(label);
      await financeCash.classifyItems({ itemIds: [item.id], category: id });
    });

  const learn = async (item: InvoiceItem, category: string, mode: LearnMode): Promise<number | null> => {
    let applied: number | null = null;
    await run(async () => {
      applied = (await financeCash.classifyAndLearn(item.id, category, mode)).applied;
    });
    return applied;
  };

  const ruleFor = (item: InvoiceItem): CategoryRule | null => findRule(item, rules);

  return {
    pending, error, categories, rules, labelFor, suggestionFor, classify, accept, acceptMany,
    classifyWithNewCategory, learn, ruleFor,
  };
}

export type Classification = ReturnType<typeof useClassification>;

const selectClass =
  'min-h-11 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-inset)] px-2 py-2 text-[var(--foreground)] max-w-full';

function NewCategoryForm({ onCreate, onCancel, disabled }: { onCreate: (label: string) => void; onCancel: () => void; disabled: boolean }) {
  const [label, setLabel] = useState('');
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => { e.preventDefault(); if (label.trim().length >= 2) onCreate(label); }}
    >
      <input
        aria-label="Nome da nova categoria"
        className={`${selectClass} min-w-0 flex-1`}
        placeholder="Ex.: Armazenamento"
        maxLength={40}
        value={label}
        autoFocus
        onChange={(e) => setLabel(e.target.value)}
      />
      <button type="submit" className={buttonSecondary} disabled={disabled || label.trim().length < 2}>Criar e usar</button>
      <button type="button" className={buttonGhost} onClick={onCancel}>Cancelar</button>
    </form>
  );
}

/** Aprendizado automático: só informa o que o painel vai lembrar; não pede segunda confirmação. */
function LearnNote({ item, category, classification }: { item: InvoiceItem; category: string; classification: Classification }) {
  const ambiguous = isAmbiguousMerchant(merchantKey(item.baseDescription));
  const rule = classification.ruleFor(item);
  if (rule && rule.category === category) {
    return <p className="text-sm text-[var(--text-muted)]">Lembrado: {describeRule(rule, centsToBRL)}. Gerencie em “Regras aprendidas”.</p>;
  }
  return (
    <p className="text-sm text-[var(--text-muted)]">
      {ambiguous
        ? `Este estabelecimento cobra serviços diferentes: o painel lembra esta escolha só para o mesmo valor (${centsToBRL(item.amountCents)}).`
        : 'O painel lembra esta escolha para lançamentos equivalentes deste estabelecimento.'}
    </p>
  );
}

export function ClassifierControls({ item, classification }: { item: InvoiceItem; classification: Classification }) {
  const suggestion = classification.suggestionFor(item);
  const [creating, setCreating] = useState(false);
  const byRule = item.categorySource === 'rule';
  const current = resolveCategoryId(item.category, classification.categories);

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={`Categoria de ${item.description}`}
          className={selectClass}
          value={current ?? ''}
          disabled={classification.pending}
          onChange={(e) => {
            if (e.target.value === NEW_CATEGORY) { setCreating(true); return; }
            void classification.classify(item, e.target.value || null);
          }}
        >
          <option value="">Sem categoria</option>
          {classification.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          <option value={NEW_CATEGORY}>+ Nova categoria…</option>
        </select>
        {byRule && <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs text-[var(--text-muted)]" title="Classificado automaticamente por uma regra aprendida">por regra</span>}
      </div>

      {creating && (
        <NewCategoryForm
          disabled={classification.pending}
          onCancel={() => setCreating(false)}
          onCreate={async (label) => { if (await classification.classifyWithNewCategory(item, label)) setCreating(false); }}
        />
      )}

      {!current && suggestion && suggestion.category && (
        <button type="button" className={buttonGhost} disabled={classification.pending} onClick={() => void classification.accept(item, suggestion)}
          title={suggestion.source === 'history' ? 'Baseado no que você já confirmou para este estabelecimento' : 'Sugestão pelo nome do estabelecimento'}>
          <Sparkles size={12} /> Sugestão: {classification.labelFor(suggestion.category)} — aceitar
        </button>
      )}

      {current && !byRule && <LearnNote item={item} category={current} classification={classification} />}
    </div>
  );
}

/** Mostra o erro da última ação de classificação (se houver). */
export function ClassificationError({ classification }: { classification: Classification }) {
  return <ErrorText message={classification.error} />;
}

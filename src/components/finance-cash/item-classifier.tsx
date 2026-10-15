'use client';

import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useCommands } from '@/providers/repository.provider';
import { centsToBRL } from '@/modules/finance/domain/money';
import type { InvoiceItem } from '@/modules/finance/cash/domain/types';
import {
  CATEGORIES, PURPOSES, categoryLabel, merchantKey, purposeLabel, suggestClassification,
  type ClassificationSuggestion, type ClassifiableItem,
} from '@/modules/finance/cash/domain/categories';
import {
  describeRule, findRule, isAmbiguousMerchant, type CategoryRule, type CustomCategory,
} from '@/modules/finance/cash/domain/category-rules';
import type { LearnMode } from '@/modules/finance/cash/application/finance-cash.commands';
import { ErrorText, buttonGhost, buttonSecondary, useAction } from './ui';

type Patch = { category?: string | null; purpose?: string | null };

const NEW_CATEGORY = '__new__';

export interface ClassificationContext {
  customCategories: CustomCategory[];
  rules: CategoryRule[];
}

/** Lógica compartilhada entre a tela da fatura e a página de gastos. */
export function useClassification(items: InvoiceItem[], context: ClassificationContext = { customCategories: [], rules: [] }) {
  const { financeCash } = useCommands();
  const { pending, error, run } = useAction();
  const { customCategories, rules } = context;

  const classifiable = useMemo<ClassifiableItem[]>(
    () => items.filter((i) => i.kind !== 'payment').map((i) => ({
      id: i.id, key: merchantKey(i.baseDescription), category: i.category, purpose: i.purpose,
    })),
    [items]
  );
  const byId = useMemo(() => new Map(classifiable.map((c) => [c.id, c])), [classifiable]);
  const customIds = useMemo(() => customCategories.map((c) => c.id), [customCategories]);

  const labelFor = (id: string | null) => customCategories.find((c) => c.id === id)?.label ?? categoryLabel(id);

  const suggestionFor = (item: InvoiceItem): ClassificationSuggestion | null => {
    const self = byId.get(item.id);
    return self ? suggestClassification(self, classifiable, customIds) : null;
  };

  const toPatch = (s: ClassificationSuggestion): Patch => ({
    ...(s.category ? { category: s.category } : {}),
    ...(s.purpose ? { purpose: s.purpose } : {}),
  });

  /** Classifica SÓ este lançamento (confirmação sua). Aprender com outros é opcional e separado. */
  const classify = (item: InvoiceItem, patch: Patch) =>
    run(async () => {
      await financeCash.classifyItems({ itemIds: [item.id], ...patch });
    });

  const accept = (item: InvoiceItem, s: ClassificationSuggestion) => classify(item, toPatch(s));

  /** Aceita as sugestões de vários itens de uma vez, agrupando por combinação. */
  const acceptMany = (rows: InvoiceItem[]) =>
    run(async () => {
      const groups = new Map<string, { patch: Patch; ids: string[] }>();
      for (const row of rows) {
        const s = suggestionFor(row);
        if (!s) continue;
        const patch = toPatch(s);
        const key = JSON.stringify(patch);
        const g = groups.get(key) ?? { patch, ids: [] };
        g.ids.push(row.id);
        groups.set(key, g);
      }
      for (const g of groups.values()) await financeCash.classifyItems({ itemIds: g.ids, ...g.patch });
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
    pending, error, customCategories, rules, labelFor, suggestionFor, classify, accept, acceptMany,
    classifyWithNewCategory, learn, ruleFor,
  };
}

export type Classification = ReturnType<typeof useClassification>;

export function suggestionText(s: ClassificationSuggestion, labelFor: (id: string | null) => string = categoryLabel): string {
  const parts: string[] = [];
  if (s.category) parts.push(labelFor(s.category));
  if (s.purpose) parts.push(purposeLabel(s.purpose));
  return parts.join(' · ');
}

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

/** Opção voluntária (desligada por padrão) de aprender a categoria para lançamentos semelhantes. */
function LearnOption({ item, classification }: { item: InvoiceItem; classification: Classification }) {
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<LearnMode>('amount');
  const [done, setDone] = useState<number | null>(null);
  const key = merchantKey(item.baseDescription);
  const ambiguous = isAmbiguousMerchant(key);

  if (!item.category) return null;
  const rule = classification.ruleFor(item);
  if (rule && rule.category === item.category) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Regra ativa: {describeRule(rule, centsToBRL)}.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--text-muted)]">
        <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setDone(null); }} />
        Usar esta categoria em lançamentos semelhantes
      </label>
      {enabled && (
        <div className="space-y-2 rounded-xl border border-[var(--line)] p-3 text-sm">
          <label className="flex min-h-11 items-center gap-2">
            <input type="radio" name={`learn-${item.id}`} checked={mode === 'amount'} onChange={() => setMode('amount')} />
            <span>Mesmo estabelecimento e mesmo valor ({centsToBRL(item.amountCents)}) <span className="text-[var(--text-muted)]">— recomendado</span></span>
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="radio" name={`learn-${item.id}`} checked={mode === 'merchant'} onChange={() => setMode('merchant')} />
            <span>Qualquer valor deste estabelecimento</span>
          </label>
          {mode === 'merchant' && ambiguous && (
            <p className="text-[var(--money-warning)]">
              Atenção: este estabelecimento cobra serviços diferentes. Valer para qualquer valor pode classificar errado.
            </p>
          )}
          <p className="text-[var(--text-muted)]">Só preenche lançamentos sem categoria; o que você já classificou não muda. Dá para desfazer em “Regras aprendidas”.</p>
          <button
            type="button"
            className={buttonSecondary}
            disabled={classification.pending}
            onClick={async () => { setDone(await classification.learn(item, item.category as string, mode)); }}
          >
            Salvar regra
          </button>
          {done !== null && <p role="status" className="text-[var(--money-positive)]">Regra salva. {done} outro{done === 1 ? '' : 's'} lançamento{done === 1 ? '' : 's'} classificado{done === 1 ? '' : 's'}.</p>}
        </div>
      )}
    </div>
  );
}

export function ClassifierControls({ item, classification }: { item: InvoiceItem; classification: Classification }) {
  const suggestion = classification.suggestionFor(item);
  const [creating, setCreating] = useState(false);
  const byRule = item.categorySource === 'rule';

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={`Categoria de ${item.description}`}
          className={selectClass}
          value={item.category ?? ''}
          disabled={classification.pending}
          onChange={(e) => {
            if (e.target.value === NEW_CATEGORY) { setCreating(true); return; }
            void classification.classify(item, { category: e.target.value || null });
          }}
        >
          <option value="">Sem categoria</option>
          {CATEGORIES.filter((c) => !c.tech).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          {classification.customCategories.length > 0 && (
            <optgroup label="Minhas categorias">
              {classification.customCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </optgroup>
          )}
          <optgroup label="Tecnologia e profissional">
            {CATEGORIES.filter((c) => c.tech).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </optgroup>
          <option value={NEW_CATEGORY}>+ Nova categoria…</option>
        </select>
        <select
          aria-label={`Finalidade de ${item.description}`}
          className={selectClass}
          value={item.purpose ?? ''}
          disabled={classification.pending}
          onChange={(e) => void classification.classify(item, { purpose: e.target.value || null })}
        >
          <option value="">Não classificada</option>
          {PURPOSES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
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

      {!item.category && suggestion && (
        <button type="button" className={buttonGhost} disabled={classification.pending} onClick={() => void classification.accept(item, suggestion)}
          title={suggestion.source === 'history' ? 'Baseado no que você já confirmou para este estabelecimento' : 'Sugestão pelo nome do estabelecimento'}>
          <Sparkles size={12} /> Sugestão: {suggestionText(suggestion, classification.labelFor)} — aceitar
        </button>
      )}

      {!byRule && <LearnOption item={item} classification={classification} />}
    </div>
  );
}

/** Mostra o erro da última ação de classificação (se houver). */
export function ClassificationError({ classification }: { classification: Classification }) {
  return <ErrorText message={classification.error} />;
}

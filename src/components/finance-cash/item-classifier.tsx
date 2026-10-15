'use client';

import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useCommands } from '@/providers/repository.provider';
import type { InvoiceItem } from '@/modules/finance/cash/domain/types';
import {
  CATEGORIES, PURPOSES, categoryLabel, merchantKey, purposeLabel, suggestClassification,
  type ClassificationSuggestion, type ClassifiableItem,
} from '@/modules/finance/cash/domain/categories';
import { ErrorText, buttonGhost, useAction } from './ui';

type Patch = { category?: string | null; purpose?: string | null };

/** Lógica compartilhada entre a tela da fatura e a página de gastos. */
export function useClassification(items: InvoiceItem[]) {
  const { financeCash } = useCommands();
  const { pending, error, run } = useAction();
  const [applySimilar, setApplySimilar] = useState(true);

  const classifiable = useMemo<ClassifiableItem[]>(
    () => items.filter((i) => i.kind !== 'payment').map((i) => ({
      id: i.id, key: merchantKey(i.baseDescription), category: i.category, purpose: i.purpose,
    })),
    [items]
  );
  const byId = useMemo(() => new Map(classifiable.map((c) => [c.id, c])), [classifiable]);

  const suggestionFor = (item: InvoiceItem): ClassificationSuggestion | null => {
    const self = byId.get(item.id);
    return self ? suggestClassification(self, classifiable) : null;
  };

  const toPatch = (s: ClassificationSuggestion): Patch => ({
    ...(s.category ? { category: s.category } : {}),
    ...(s.purpose ? { purpose: s.purpose } : {}),
  });

  /** Classifica o item; opcionalmente estende aos iguais AINDA sem aquele campo (nunca sobrescreve). */
  const classify = (item: InvoiceItem, patch: Patch, similar: boolean) =>
    run(async () => {
      await financeCash.classifyItems({ itemIds: [item.id], ...patch });
      if (!similar) return;
      const self = byId.get(item.id);
      if (!self) return;
      for (const field of ['category', 'purpose'] as const) {
        const value = patch[field];
        if (!value) continue;
        const ids = classifiable.filter((o) => o.key === self.key && o.id !== item.id && o[field] === null).map((o) => o.id);
        if (ids.length > 0) await financeCash.classifyItems({ itemIds: ids, [field]: value });
      }
    });

  const accept = (item: InvoiceItem, s: ClassificationSuggestion) => classify(item, toPatch(s), applySimilar);

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

  return { pending, error, applySimilar, setApplySimilar, suggestionFor, classify, accept, acceptMany };
}

export function suggestionText(s: ClassificationSuggestion): string {
  const parts: string[] = [];
  if (s.category) parts.push(categoryLabel(s.category));
  if (s.purpose) parts.push(purposeLabel(s.purpose));
  return parts.join(' · ');
}

const selectClass =
  'rounded-lg border border-[var(--line-strong)] bg-[var(--surface-inset)] px-2 py-2 text-[var(--foreground)] max-w-full';

export function ClassifierControls({
  item, classification,
}: { item: InvoiceItem; classification: ReturnType<typeof useClassification> }) {
  const suggestion = classification.suggestionFor(item);
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <select
        aria-label={`Categoria de ${item.description}`}
        className={selectClass}
        value={item.category ?? ''}
        disabled={classification.pending}
        onChange={(e) => void classification.classify(item, { category: e.target.value || null }, classification.applySimilar && e.target.value !== '')}
      >
        <option value="">Sem categoria</option>
        {CATEGORIES.filter((c) => !c.tech).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        <optgroup label="Tecnologia e profissional">
          {CATEGORIES.filter((c) => c.tech).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </optgroup>
      </select>
      <select
        aria-label={`Finalidade de ${item.description}`}
        className={selectClass}
        value={item.purpose ?? ''}
        disabled={classification.pending}
        onChange={(e) => void classification.classify(item, { purpose: e.target.value || null }, classification.applySimilar && e.target.value !== '')}
      >
        <option value="">Não classificada</option>
        {PURPOSES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      {suggestion && (
        <button type="button" className={buttonGhost} disabled={classification.pending} onClick={() => void classification.accept(item, suggestion)}
          title={suggestion.source === 'history' ? 'Baseado no que você já confirmou para este estabelecimento' : 'Sugestão pelo nome do estabelecimento'}>
          <Sparkles size={12} /> Sugestão: {suggestionText(suggestion)} — aceitar
        </button>
      )}
    </div>
  );
}

export function SimilarToggle({ classification }: { classification: ReturnType<typeof useClassification> }) {
  return (
    <div className="space-y-1">
      <label className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
        <input type="checkbox" className="mt-0.5" checked={classification.applySimilar} onChange={(e) => classification.setApplySimilar(e.target.checked)} />
        <span>Ao classificar, aplicar também aos lançamentos do mesmo estabelecimento que ainda não têm esse campo (nunca sobrescreve o que você já definiu).</span>
      </label>
      <ErrorText message={classification.error} />
    </div>
  );
}

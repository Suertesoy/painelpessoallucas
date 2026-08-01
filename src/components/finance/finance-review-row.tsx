'use client';

import { useState } from 'react';
import { centsToBRL } from '@/modules/finance/domain/money';
import type { FinanceImportRow } from '@/modules/finance/domain/finance-import.schema';
import type { FinanceNature } from '@/modules/finance/domain/finance-transaction.schema';
import type { FinanceCategory } from '@/modules/finance/domain/finance-category.schema';

const NATURE_OPTIONS: { value: FinanceNature; label: string }[] = [
  { value: 'purchase', label: 'Compra' },
  { value: 'fee', label: 'Tarifa' },
  { value: 'transfer', label: 'Transferência' },
  { value: 'invoice_payment', label: 'Pagamento de fatura' },
  { value: 'refund', label: 'Estorno' },
  { value: 'unidentified_credit', label: 'Crédito não identificado' },
  { value: 'ignored', label: 'Ignorado' },
];

export interface ReviewRowPatch {
  categoryId: string;
  nature: FinanceNature;
  description: string;
}

interface DraftState {
  categoryId: string;
  nature: FinanceNature;
  description: string;
}

function draftFromRow(row: FinanceImportRow): DraftState {
  return { categoryId: row.categoryId, nature: row.nature, description: row.description };
}

/**
 * Uma linha da revisão de importação. Mantém rascunho local (`dirty`)
 * separado do valor persistido recebido via prop: enquanto o usuário estiver
 * editando ou a linha estiver salvando, um refetch reativo (realtime ou nova
 * categorização) NUNCA sobrescreve os campos em edição — a sincronização com
 * `row` só acontece quando não há edição em andamento.
 */
export function FinanceReviewRow({
  row,
  categories,
  onSave,
  onIgnore,
  onCreateRule,
}: {
  row: FinanceImportRow;
  categories: FinanceCategory[];
  onSave: (rowId: string, patch: ReviewRowPatch) => Promise<void>;
  onIgnore: (rowId: string) => Promise<void>;
  onCreateRule: (input: { matchText: string; categoryId: string; nature: FinanceNature }) => Promise<void>;
}) {
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<DraftState>(() => draftFromRow(row));
  const [saving, setSaving] = useState(false);
  const [offerRule, setOfferRule] = useState(false);
  const [createRuleChecked, setCreateRuleChecked] = useState(false);

  // Ajuste de estado durante a renderização, não em useEffect: enquanto a
  // linha estiver suja ou salvando, um refetch reativo (realtime ou nova
  // categorização) nunca sobrescreve o rascunho local.
  const [syncedRow, setSyncedRow] = useState(row);
  if (!dirty && !saving && row !== syncedRow) {
    setSyncedRow(row);
    setDraft(draftFromRow(row));
  }

  const isDuplicate = Boolean(row.possibleDuplicateTransactionId || row.possibleDuplicateImportRowId);
  const changedCategory = draft.categoryId !== row.suggestedCategoryId && Boolean(row.suggestedCategoryId);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(row.id, { categoryId: draft.categoryId, nature: draft.nature, description: draft.description });
      if (createRuleChecked) {
        await onCreateRule({ matchText: draft.description, categoryId: draft.categoryId, nature: draft.nature });
      }
      setDirty(false);
      setOfferRule(changedCategory);
      setCreateRuleChecked(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className={`rounded-lg border p-3 text-sm ${row.status === 'ignored' ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-gray-200 bg-white'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <input
            type="text"
            value={draft.description}
            onChange={(e) => {
              setDirty(true);
              setDraft((prev) => ({ ...prev, description: e.target.value }));
            }}
            aria-label="Descrição do lançamento"
            className="w-full rounded border border-gray-200 px-2 py-1 text-sm font-medium text-gray-800"
          />
          <p className="mt-1 text-xs text-gray-400">
            {row.transactionDate.split('-').reverse().join('/')} · Original: {row.originalDescription}
          </p>
          {row.classificationReason && (
            <p className="mt-0.5 text-xs text-gray-400">Sugestão: {row.classificationReason}</p>
          )}
          {isDuplicate && (
            <p className="mt-1 text-xs font-medium text-amber-700">Possível duplicidade — confira antes de confirmar.</p>
          )}
        </div>
        <span className={`shrink-0 font-medium ${row.amountCents < 0 ? 'text-gray-800' : 'text-green-700'}`}>
          {centsToBRL(row.amountCents)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={draft.categoryId}
          onChange={(e) => {
            setDirty(true);
            setDraft((prev) => ({ ...prev, categoryId: e.target.value }));
          }}
          aria-label="Categoria"
          className="rounded border border-gray-300 px-2 py-1 text-xs"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={draft.nature}
          onChange={(e) => {
            setDirty(true);
            setDraft((prev) => ({ ...prev, nature: e.target.value as FinanceNature }));
          }}
          aria-label="Natureza da movimentação"
          className="rounded border border-gray-300 px-2 py-1 text-xs"
        >
          {NATURE_OPTIONS.map((n) => (
            <option key={n.value} value={n.value}>
              {n.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || (!dirty && row.status !== 'pending_review')}
          className="rounded border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        {row.status !== 'ignored' && (
          <button
            type="button"
            onClick={() => void onIgnore(row.id)}
            className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Ignorar
          </button>
        )}
      </div>

      {offerRule && (
        <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={createRuleChecked} onChange={(e) => setCreateRuleChecked(e.target.checked)} />
          Aplicar esta classificação a lançamentos semelhantes no futuro
        </label>
      )}
    </li>
  );
}

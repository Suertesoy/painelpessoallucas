'use client';

import { useState, type FormEvent } from 'react';
import type { MonthOverview } from '@/modules/finance/application/finance-analytics.queries';

export interface FinanceMonthlyFormValues {
  matheusIncomeReais: string;
  lucasIncomeReais: string;
  otherIncomeReais: string;
  availableCashReais: string;
  savedCashReais: string;
}

function centsToReaisInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

function reaisInputToCents(value: string): number {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function valuesFromOverview(overview: MonthOverview): FinanceMonthlyFormValues {
  return {
    matheusIncomeReais: centsToReaisInput(overview.matheusIncomeCents),
    lucasIncomeReais: centsToReaisInput(overview.lucasIncomeCents),
    otherIncomeReais: centsToReaisInput(overview.otherIncomeCents),
    availableCashReais: centsToReaisInput(overview.availableCashCents),
    savedCashReais: centsToReaisInput(overview.savedCashCents),
  };
}

/**
 * Renda de Matheus/Lucas, outras entradas, disponível e guardado. Enquanto o
 * usuário estiver editando (`dirty`), um refetch reativo (realtime ou
 * mudança de mês) nunca sobrescreve os valores digitados ainda não salvos.
 */
export function FinanceMonthlyForm({
  overview,
  defaultMatheusIncomeCents,
  onSubmit,
  onUpdateDefaultMatheusIncome,
}: {
  overview: MonthOverview;
  defaultMatheusIncomeCents: number;
  onSubmit: (values: {
    matheusIncomeCents: number;
    lucasIncomeCents: number;
    otherIncomeCents: number;
    availableCashCents: number;
    savedCashCents: number;
  }) => Promise<void>;
  onUpdateDefaultMatheusIncome: (cents: number) => Promise<void>;
}) {
  const [dirty, setDirty] = useState(false);
  const [values, setValues] = useState<FinanceMonthlyFormValues>(() => valuesFromOverview(overview));
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ajuste de estado durante a renderização (padrão documentado do React
  // para "resetar estado quando uma prop muda"), não em useEffect: enquanto
  // `dirty` for true, o valor digitado nunca é sobrescrito por um refetch
  // reativo/realtime; quando não há edição em andamento, sincroniza assim
  // que a referência de `overview` mudar.
  const [syncedOverview, setSyncedOverview] = useState(overview);
  if (!dirty && overview !== syncedOverview) {
    setSyncedOverview(overview);
    setValues(valuesFromOverview(overview));
  }

  const [defaultDraft, setDefaultDraft] = useState(() => centsToReaisInput(defaultMatheusIncomeCents));
  const [defaultDirty, setDefaultDirty] = useState(false);
  const [syncedDefaultCents, setSyncedDefaultCents] = useState(defaultMatheusIncomeCents);
  if (!defaultDirty && defaultMatheusIncomeCents !== syncedDefaultCents) {
    setSyncedDefaultCents(defaultMatheusIncomeCents);
    setDefaultDraft(centsToReaisInput(defaultMatheusIncomeCents));
  }

  const field = (key: keyof FinanceMonthlyFormValues) => ({
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setDirty(true);
      setSavedMessage(null);
      setValues((prev) => ({ ...prev, [key]: e.target.value }));
    },
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        matheusIncomeCents: reaisInputToCents(values.matheusIncomeReais),
        lucasIncomeCents: reaisInputToCents(values.lucasIncomeReais),
        otherIncomeCents: reaisInputToCents(values.otherIncomeReais),
        availableCashCents: reaisInputToCents(values.availableCashReais),
        savedCashCents: reaisInputToCents(values.savedCashReais),
      });
      setDirty(false);
      setSavedMessage('Valores do mês salvos.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar os valores do mês.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDefault = async () => {
    setError(null);
    try {
      await onUpdateDefaultMatheusIncome(reaisInputToCents(defaultDraft));
      setDefaultDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar o valor padrão.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-800">Renda e situação atual do mês</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs text-gray-600">
          Renda de Matheus (R$)
          <input type="number" step="0.01" min="0" inputMode="decimal" className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" {...field('matheusIncomeReais')} />
        </label>
        <label className="text-xs text-gray-600">
          Renda de Lucas (R$)
          <input type="number" step="0.01" min="0" inputMode="decimal" className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" {...field('lucasIncomeReais')} />
        </label>
        <label className="text-xs text-gray-600">
          Outras entradas (R$)
          <input type="number" step="0.01" min="0" inputMode="decimal" className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" {...field('otherIncomeReais')} />
        </label>
        <span />
        <label className="text-xs text-gray-600">
          Dinheiro disponível (R$)
          <input type="number" step="0.01" min="0" inputMode="decimal" className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" {...field('availableCashReais')} />
        </label>
        <label className="text-xs text-gray-600">
          Dinheiro guardado (R$)
          <input type="number" step="0.01" min="0" inputMode="decimal" className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" {...field('savedCashReais')} />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Salvando…' : 'Salvar valores do mês'}
        </button>
        {savedMessage && <span className="text-xs text-green-700">{savedMessage}</span>}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}

      <div className="mt-4 border-t pt-3">
        <p className="text-xs text-gray-600">
          Valor padrão de renda do Matheus para <strong>novos</strong> meses (alterar aqui nunca modifica meses já criados):
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={defaultDraft}
            onChange={(e) => {
              setDefaultDirty(true);
              setDefaultDraft(e.target.value);
            }}
            className="w-32 rounded border border-gray-300 px-2 py-1.5 text-sm"
            aria-label="Valor padrão de renda do Matheus"
          />
          <button
            type="button"
            onClick={() => void handleSaveDefault()}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Atualizar padrão
          </button>
        </div>
      </div>
    </form>
  );
}

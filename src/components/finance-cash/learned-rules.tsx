'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useCommands } from '@/providers/repository.provider';
import { centsToBRL } from '@/modules/finance/domain/money';
import { CATEGORIES } from '@/modules/finance/cash/domain/categories';
import { describeRule, type CategoryRule, type CustomCategory } from '@/modules/finance/cash/domain/category-rules';
import { Dialog, ErrorText, buttonGhost, buttonPrimary, buttonSecondary, useAction } from './ui';

const selectClass =
  'min-h-11 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-inset)] px-2 py-2 text-[var(--foreground)] max-w-full';

/**
 * Regras aprendidas: consultar, trocar a categoria e excluir. Recolhido por
 * padrão (é uma área de manutenção, não de uso diário).
 */
export function LearnedRules({ rules, customCategories, labelFor }: {
  rules: CategoryRule[]; customCategories: CustomCategory[]; labelFor: (id: string | null) => string;
}) {
  const { financeCash } = useCommands();
  const { pending, error, run, clearError } = useAction();
  const [deleting, setDeleting] = useState<{ rule: CategoryRule; count: number } | null>(null);
  const [revert, setRevert] = useState(true);

  if (rules.length === 0) return null;

  async function askDelete(rule: CategoryRule) {
    clearError();
    let count = 0;
    await run(async () => { count = await financeCash.countRuleItems(rule.id); });
    setRevert(true);
    setDeleting({ rule, count });
  }

  return (
    <details className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      <summary className="cursor-pointer p-4 text-base font-semibold">
        Regras aprendidas <span className="text-sm font-normal text-[var(--text-muted)]">({rules.length})</span>
      </summary>
      <div className="space-y-3 border-t border-[var(--line)] p-4">
        <p className="text-sm text-[var(--text-muted)]">
          Aplicadas em novas importações, só em lançamentos sem categoria. Nada que você classificou à mão é alterado.
        </p>
        <ErrorText message={error} />
        <ul className="divide-y divide-[var(--line)]">
          {rules.map((r) => (
            <li key={r.id} className="space-y-2 py-3">
              <p className="break-words text-sm font-medium">{describeRule(r, centsToBRL)}</p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`Categoria da regra ${r.merchantKey}`}
                  className={selectClass}
                  value={r.category}
                  disabled={pending}
                  onChange={(e) => void run(() => financeCash.changeRuleCategory(r.id, e.target.value))}
                >
                  {CATEGORIES.filter((c) => !c.tech).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  {customCategories.length > 0 && (
                    <optgroup label="Minhas categorias">
                      {customCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </optgroup>
                  )}
                  <optgroup label="Tecnologia e profissional">
                    {CATEGORIES.filter((c) => c.tech).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </optgroup>
                </select>
                <button type="button" className={buttonGhost} disabled={pending} onClick={() => void askDelete(r)} aria-label={`Excluir regra ${r.merchantKey}`}>
                  <Trash2 size={14} /> Excluir
                </button>
              </div>
              <p className="text-xs text-[var(--text-muted)]">Categoria atual: {labelFor(r.category)}</p>
            </li>
          ))}
        </ul>
      </div>

      <Dialog open={deleting !== null} title="Excluir regra" onClose={() => setDeleting(null)}>
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm">{describeRule(deleting.rule, centsToBRL)}</p>
            {deleting.count > 0 ? (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={revert} onChange={(e) => setRevert(e.target.checked)} />
                <span>
                  Tirar a categoria dos {deleting.count} lançamento{deleting.count === 1 ? '' : 's'} que esta regra classificou
                  <span className="block text-xs text-[var(--text-muted)]">Desmarcado, eles ficam com a categoria atual como se fosse sua.</span>
                </span>
              </label>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">Esta regra não classificou nenhum lançamento.</p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className={buttonSecondary} onClick={() => setDeleting(null)}>Cancelar</button>
              <button
                type="button"
                className={buttonPrimary}
                disabled={pending}
                onClick={async () => { if (await run(() => financeCash.deleteCategoryRule(deleting.rule.id, revert && deleting.count > 0))) setDeleting(null); }}
              >
                Excluir regra
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </details>
  );
}

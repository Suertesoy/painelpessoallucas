'use client';

import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useCommands } from '@/providers/repository.provider';
import type { Category } from '@/modules/finance/cash/domain/categories';
import { Dialog, ErrorText, buttonGhost, buttonPrimary, buttonSecondary, useAction } from './ui';

const fieldClass =
  'min-h-11 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-inset)] px-3 py-2 text-[var(--foreground)] max-w-full';

/**
 * Gerenciar categorias: criar, renomear (inclusive as da lista inicial) e
 * excluir. Cada lançamento tem uma só categoria. Renomear muda só o nome;
 * excluir nunca remapeia sozinho: com substituta (opcional) os lançamentos vão
 * para ela, sem substituta ficam "Sem categoria". Valores e datas não mudam.
 * Recolhido por padrão: é manutenção, não uso diário.
 */
export function CategoryManager({ categories, persisted }: { categories: Category[]; persisted: boolean }) {
  const { financeCash } = useCommands();
  const { pending, error, run, clearError } = useAction();
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);
  const [deleting, setDeleting] = useState<{ category: Category; uses: number } | null>(null);
  const [replacement, setReplacement] = useState('');

  async function askDelete(category: Category) {
    clearError();
    let uses = 0;
    const ok = await run(async () => { uses = await financeCash.countCategoryUse(category.id); });
    if (!ok) return;
    setReplacement('');
    setDeleting({ category, uses });
  }

  return (
    <details className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      <summary className="min-h-11 cursor-pointer p-4 text-base font-semibold">
        Categorias <span className="text-sm font-normal text-[var(--text-muted)]">({categories.length})</span>
      </summary>
      <div className="space-y-4 border-t border-[var(--line)] p-4">
        <p className="text-sm text-[var(--text-muted)]">
          Cada lançamento tem uma única categoria. As categorias iniciais são só um ponto de partida: renomeie, exclua ou crie as suas.
        </p>
        {!persisted && (
          <p role="status" className="rounded-lg bg-[var(--surface-inset)] p-3 text-sm text-[var(--money-warning)]">
            Criar, renomear e excluir categorias fica disponível assim que a atualização do banco de dados for aplicada.
          </p>
        )}
        <ErrorText message={error} />

        <ul className="divide-y divide-[var(--line)]">
          {categories.map((c) => (
            <li key={c.id} className="py-2">
              {renaming?.id === c.id ? (
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await run(() => financeCash.renameCategory(c.id, renaming.label))) setRenaming(null);
                  }}
                >
                  <input aria-label={`Novo nome de ${c.label}`} className={`${fieldClass} min-w-0 flex-1`} maxLength={40} autoFocus value={renaming.label} onChange={(e) => setRenaming({ id: c.id, label: e.target.value })} />
                  <button type="submit" className={buttonSecondary} disabled={pending || renaming.label.trim().length < 2}>Salvar</button>
                  <button type="button" className={buttonGhost} onClick={() => setRenaming(null)}>Cancelar</button>
                </form>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 break-words text-sm">{c.label}</span>
                  <button type="button" className={buttonGhost} disabled={!persisted || pending} aria-label={`Renomear ${c.label}`} onClick={() => { clearError(); setRenaming({ id: c.id, label: c.label }); }}>
                    <Pencil size={14} /> Renomear
                  </button>
                  <button type="button" className={buttonGhost} disabled={!persisted || pending} aria-label={`Excluir ${c.label}`} onClick={() => void askDelete(c)}>
                    <Trash2 size={14} /> Excluir
                  </button>
                </div>
              )}
            </li>
          ))}
          {categories.length === 0 && <li className="py-3 text-sm text-[var(--text-muted)]">Nenhuma categoria. Crie a primeira abaixo.</li>}
        </ul>

        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(async () => { await financeCash.createCategory(newName); })) setNewName('');
          }}
        >
          <input aria-label="Nome da nova categoria" className={`${fieldClass} min-w-0 flex-1`} placeholder="Nova categoria" maxLength={40} value={newName} disabled={!persisted} onChange={(e) => setNewName(e.target.value)} />
          <button type="submit" className={buttonSecondary} disabled={!persisted || pending || newName.trim().length < 2}>Criar</button>
        </form>
      </div>

      <Dialog open={deleting !== null} title="Excluir categoria" onClose={() => setDeleting(null)}>
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm font-medium">{deleting.category.label}</p>
            <p className="text-sm text-[var(--text-muted)]">
              {deleting.uses === 0
                ? 'Nenhum lançamento usa esta categoria.'
                : `${deleting.uses} lançamento${deleting.uses === 1 ? '' : 's'} usa${deleting.uses === 1 ? '' : 'm'} esta categoria. Valores e datas não mudam.`}
            </p>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Mover para outra categoria (opcional)</span>
              <select className={`${fieldClass} w-full`} value={replacement} onChange={(e) => setReplacement(e.target.value)}>
                <option value="">Nenhuma — ficam “Sem categoria”</option>
                {categories.filter((c) => c.id !== deleting.category.id).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <p className="text-xs text-[var(--text-muted)]">
              {replacement
                ? 'As regras aprendidas desta categoria passam para a escolhida.'
                : 'As regras aprendidas desta categoria também serão excluídas.'}
            </p>
            <ErrorText message={error} />
            <div className="flex justify-end gap-2">
              <button type="button" className={buttonSecondary} onClick={() => setDeleting(null)}>Cancelar</button>
              <button
                type="button"
                className={buttonPrimary}
                disabled={pending}
                onClick={async () => { if (await run(() => financeCash.deleteCategory(deleting.category.id, replacement || null))) setDeleting(null); }}
              >
                Excluir categoria
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </details>
  );
}

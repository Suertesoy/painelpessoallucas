'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Archive, Plus, Search, StickyNote } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { useWorkspace } from '@/providers/auth.provider';
import type { Item, ItemType } from '@/modules/items/domain/item.schema';
import { DataErrorNotice } from '@/components/data-error-notice';

/** Tipos que já eram "conhecimento" na tela antiga: nenhuma nota existente some. */
const NOTE_TYPES: ItemType[] = ['note', 'idea', 'insight', 'decision', 'reference'];

const inputClass =
  'w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-900 placeholder:text-gray-400';

function titleOf(item: Item): string {
  const t = item.title?.trim();
  if (t) return t;
  const firstLine = item.content?.trim().split('\n')[0];
  return firstLine || 'Nota sem título';
}

function NoteEditor({ initial, onClose }: { initial: Item | null; onClose: () => void }) {
  const { item: itemCmds } = useCommands();
  const { workspaceId } = useWorkspace();
  const [noteId, setNoteId] = useState<string | null>(initial?.id ?? null);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const lastSaved = useRef({ title: initial?.title ?? '', content: initial?.content ?? '' });
  const idRef = useRef<string | null>(initial?.id ?? null);
  const saving = useRef<Promise<void> | null>(null);

  async function save(): Promise<void> {
    if (saving.current) await saving.current;
    if (title === lastSaved.current.title && content === lastSaved.current.content) return;
    if (!title.trim() && !content.trim() && !idRef.current) return;
    const run = async () => {
      setStatus('saving');
      try {
        if (idRef.current) {
          await itemCmds.updateItem(idRef.current, { title, content });
        } else {
          const created = await itemCmds.createItem({ title: title || undefined, content: content || undefined, type: 'note', skipInbox: true }, workspaceId);
          idRef.current = created.id;
          setNoteId(created.id);
        }
        lastSaved.current = { title, content };
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    };
    saving.current = run().finally(() => { saving.current = null; });
    await saving.current;
  }

  // Salvamento automático: pausa na digitação.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const t = setTimeout(() => { void saveRef.current(); }, 800);
    return () => clearTimeout(t);
  }, [title, content]);

  async function close() {
    await save();
    onClose();
  }

  async function archive() {
    if (!noteId) { onClose(); return; }
    if (!confirm('Arquivar esta nota? Ela some da lista, mas não é apagada do histórico.')) return;
    await itemCmds.archiveItem(noteId);
    onClose();
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 pb-28 md:p-8">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => void close()} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-blue-700">
          <ArrowLeft size={18} /> Notas
        </button>
        <span className="text-sm text-gray-500" role="status" aria-live="polite">
          {status === 'saving' ? 'Salvando…' : status === 'saved' ? 'Salvo' : status === 'error' ? 'Não foi possível salvar' : ''}
        </span>
      </div>
      <input
        aria-label="Título"
        className={`${inputClass} text-lg font-semibold`}
        placeholder="Título"
        value={title}
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        aria-label="Texto da nota"
        className={`${inputClass} min-h-[50dvh] leading-relaxed`}
        placeholder="Escreva aqui…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        autoFocus={!initial}
      />
      {noteId && (
        <button type="button" onClick={() => void archive()} className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg px-2 text-sm text-gray-600 hover:bg-gray-100">
          <Archive size={16} /> Arquivar nota
        </button>
      )}
    </div>
  );
}

export default function NotasPage() {
  const { item: itemQueries } = useQueries();
  const { data: items, isLoading, error, isOffline, refetch } = useReactiveQuery(() => itemQueries.listItems(), []);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ item: Item | null } | null>(null);

  const notes = useMemo(() => {
    // Capturas ainda na Caixa de Entrada têm `note` só como valor provisório.
    let list = (items ?? []).filter((i) => NOTE_TYPES.includes(i.type) && i.status !== 'inbox' && i.status !== 'archived');
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((i) => `${i.title ?? ''} ${i.content ?? ''}`.toLowerCase().includes(q));
    return list.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [items, search]);

  if (editing) {
    return <NoteEditor key={editing.item?.id ?? 'nova'} initial={editing.item} onClose={() => setEditing(null)} />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 pb-28 md:p-8">
      <header className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><StickyNote className="text-amber-500" /> Notas</h1>
        <button type="button" onClick={() => setEditing({ item: null })} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700">
          <Plus size={18} /> Nova nota
        </button>
      </header>

      {error && <DataErrorNotice isOffline={isOffline} onRetry={refetch} />}
      {!error && isLoading && !items && <p className="text-gray-600">Carregando…</p>}

      {!error && items && (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input aria-label="Buscar nas notas" className={`${inputClass} pl-10`} placeholder="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {notes.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-gray-600">
              {search ? 'Nenhuma nota encontrada.' : 'Ainda não há notas. Toque em “Nova nota” para começar.'}
            </p>
          ) : (
            <ul className="space-y-3">
              {notes.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => setEditing({ item: n })} className="block min-h-16 w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm hover:shadow-md">
                    <span className="block truncate text-base font-semibold text-gray-900">{titleOf(n)}</span>
                    {n.content && n.title && <span className="mt-1 line-clamp-2 block text-sm text-gray-600">{n.content}</span>}
                    <span className="mt-2 block text-xs text-gray-500">{format(parseISO(n.updatedAt), "d 'de' MMM", { locale: ptBR })}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

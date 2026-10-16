'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Check, ChevronDown, MessageCircle, Pencil, Plus, ShoppingCart, Sparkles, Trash2, X } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries, useRepositories } from '@/providers/repository.provider';
import { useWorkspace } from '@/providers/auth.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import type { Item } from '@/modules/items/domain/item.schema';
import type { ShoppingListBoard } from '@/modules/shopping/application/shopping.queries';
import {
  buildWhatsAppShareText,
  buildWhatsAppShareUrl,
  isValidWhatsAppNumber,
} from '@/modules/shopping/domain/whatsapp-share';
import {
  buildKnownItems,
  normalizeItemKey,
  suggestCorrection,
  suggestRecurring,
  type KnownItem,
} from '@/modules/shopping/domain/shopping-suggestions';

function itemLabel(item: Item): string {
  return item.title ?? item.content ?? '';
}

function ShoppingItemRow({
  item,
  otherLists,
  isEditing,
  editingValue,
  onToggle,
  onStartEdit,
  onEditingValueChange,
  onCommitEdit,
  onCancelEdit,
  onDelete,
  onMove,
}: {
  item: Item;
  otherLists: { id: string; name: string }[];
  isEditing: boolean;
  editingValue: string;
  onToggle: (item: Item) => void;
  onStartEdit: (item: Item) => void;
  onEditingValueChange: (value: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (item: Item) => void;
  onMove: (item: Item, newListId: string) => void;
}) {
  const purchased = item.status === 'completed';

  return (
    <li
      className={`flex min-h-14 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 shadow-[0_6px_16px_-12px_rgba(0,0,0,0.7)] ${
        purchased ? 'opacity-60' : ''
      }`}
    >
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={purchased}
          onChange={() => onToggle(item)}
          aria-label={purchased ? `Desmarcar ${itemLabel(item)} como comprado` : `Marcar ${itemLabel(item)} como comprado`}
          className="h-6 w-6 shrink-0 accent-blue-600"
        />
        {isEditing ? (
          <input
            type="text"
            autoFocus
            value={editingValue}
            onChange={(e) => onEditingValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onCommitEdit();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                onCancelEdit();
              }
            }}
            onBlur={onCommitEdit}
            aria-label="Editar item"
            className="min-w-0 flex-1 rounded-lg border border-blue-400 px-2 py-1 text-base outline-none"
          />
        ) : (
          <span className={`min-w-0 flex-1 truncate text-base text-gray-800 ${purchased ? 'line-through' : ''}`}>
            {itemLabel(item)}
          </span>
        )}
      </label>

      <div className="flex shrink-0 items-center gap-1">
        {otherLists.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onMove(item, e.target.value);
            }}
            aria-label={`Mover ${itemLabel(item)} para outra lista`}
            className="max-w-24 rounded-lg border border-gray-200 bg-white p-1.5 text-xs text-gray-600 outline-none hover:bg-gray-50"
          >
            <option value="">Mover…</option>
            {otherLists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        {isEditing ? (
          <button
            type="button"
            onClick={onCommitEdit}
            aria-label="Salvar edição"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-green-700 hover:bg-green-50"
          >
            <Check size={18} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onStartEdit(item)}
            aria-label={`Editar ${itemLabel(item)}`}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
          >
            <Pencil size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(item)}
          aria-label={`Excluir ${itemLabel(item)}`}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </li>
  );
}

export default function ComprasPage() {
  const { workspaceId } = useWorkspace();
  const { item: itemCmds, shopping: shoppingCmds } = useCommands();
  const { shopping: shoppingQueries } = useQueries();
  const { changeNotifier } = useRepositories();

  const {
    data: board,
    isLoading,
    error,
    isOffline,
    refetch,
  } = useReactiveQuery(() => shoppingQueries.getBoard(), []);

  // Fluxo único de inicialização/recuperação: usado tanto na montagem quanto
  // pelo botão "Tentar novamente" do DataErrorNotice, inclusive quando a
  // primeira tentativa falhou (ex.: permissão ausente no Supabase). O ref
  // evita rodar duas vezes em paralelo (clique repetido, ou o efeito de
  // montagem disparando enquanto uma retentativa manual já está em curso).
  const [initFailed, setInitFailed] = useState(false);
  const isInitializingRef = useRef(false);
  const runInit = useCallback(async () => {
    if (isInitializingRef.current) return;
    isInitializingRef.current = true;
    setInitFailed(false);
    try {
      await shoppingCmds.ensureDefaultLists();
      refetch();
    } catch (e) {
      // Nunca expõe e.message na UI (pode conter detalhes internos do
      // Supabase, ex.: "permission denied for table shopping_lists") — só o
      // console recebe o erro completo, mesmo padrão de useReactiveQuery.
      console.error('Erro ao preparar as listas de compras', e);
      setInitFailed(true);
    } finally {
      isInitializingRef.current = false;
    }
  }, [shoppingCmds, refetch]);

  useEffect(() => {
    const timer = setTimeout(() => void runInit(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasError = Boolean(error) || initFailed;

  const [whatsappNumber, setWhatsappNumber] = useState<string | null>(null);
  const fetchWhatsappNumber = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/shopping');
      if (res.ok) {
        const body = (await res.json()) as { whatsappNumber: string | null };
        setWhatsappNumber(body.whatsappNumber ?? null);
      }
    } catch {
      // Compartilhamento fica desabilitado com explicação — nunca um erro bloqueante.
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void fetchWhatsappNumber(), 0);
    const unsubscribe = changeNotifier.subscribe(() => void fetchWhatsappNumber());
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [fetchWhatsappNumber, changeNotifier]);

  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const currentBoard: ShoppingListBoard | undefined = useMemo(() => {
    if (!board || board.length === 0) return undefined;
    return board.find((b) => b.list.id === selectedListId) ?? board[0];
  }, [board, selectedListId]);

  const otherLists = useMemo(
    () => (board ?? []).filter((b) => b.list.id !== currentBoard?.list.id).map((b) => b.list),
    [board, currentBoard]
  );

  // Base das sugestões: o histórico da lista (inclui comprados e "limpos");
  // sem histórico (dados antigos), usa o que está na tela.
  const known: KnownItem[] = useMemo(() => {
    if (!currentBoard) return [];
    const history =
      currentBoard.history ??
      [...currentBoard.pending, ...currentBoard.purchased].map((i) => ({
        title: itemLabel(i),
        createdAt: i.createdAt,
        completedAt: i.completedAt,
      }));
    return buildKnownItems(history);
  }, [currentBoard]);

  const [now] = useState(() => new Date());
  const pendingKeys = useMemo(
    () => new Set((currentBoard?.pending ?? []).map((i) => normalizeItemKey(itemLabel(i)))),
    [currentBoard]
  );
  const recurring = useMemo(() => suggestRecurring(known, pendingKeys, now), [known, pendingKeys, now]);

  const [newTitle, setNewTitle] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [correction, setCorrection] = useState<{ typed: string; suggestion: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addItem = async (title: string) => {
    if (!currentBoard) return;
    setAddError(null);
    try {
      await itemCmds.createItem(
        {
          title,
          type: 'shopping_item',
          source: 'manual',
          shoppingListId: currentBoard.list.id,
          skipInbox: true,
        },
        workspaceId
      );
      setNewTitle('');
      setCorrection(null);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Não foi possível adicionar o item.');
    } finally {
      inputRef.current?.focus();
    }
  };

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || !currentBoard) return;
    // Parece um erro de digitação de algo que você já comprou? Pergunta antes.
    const near = suggestCorrection(title, known);
    if (near && !correction) {
      setCorrection({ typed: title, suggestion: near.label });
      return;
    }
    await addItem(title);
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const startEdit = (item: Item) => {
    setEditingId(item.id);
    setEditingValue(itemLabel(item));
  };
  const cancelEdit = () => setEditingId(null);
  const commitEdit = async () => {
    if (!editingId) return;
    const title = editingValue.trim();
    const id = editingId;
    setEditingId(null);
    if (title) {
      await itemCmds.updateItem(id, { title });
    }
  };

  const togglePurchased = async (item: Item) => {
    if (item.status === 'completed') {
      await itemCmds.reopenItem(item.id);
    } else {
      await itemCmds.completeItem(item.id);
    }
  };

  const handleDelete = async (item: Item) => {
    if (!confirm(`Excluir "${itemLabel(item)}"?`)) return;
    await itemCmds.archiveItem(item.id);
  };

  const handleMove = async (item: Item, newListId: string) => {
    await itemCmds.updateItem(item.id, { shoppingListId: newListId });
  };

  const handleClearPurchased = async () => {
    if (!currentBoard || currentBoard.purchased.length === 0) return;
    if (
      !confirm(
        `Remover ${currentBoard.purchased.length} item(ns) comprado(s) de ${currentBoard.list.name}?`
      )
    ) {
      return;
    }
    for (const item of currentBoard.purchased) {
      await itemCmds.archiveItem(item.id);
    }
  };

  const pendingTitles = (currentBoard?.pending ?? []).map(itemLabel).filter(Boolean);
  let shareDisabledReason: string | null = null;
  if (!whatsappNumber || !isValidWhatsAppNumber(whatsappNumber)) {
    shareDisabledReason = 'Configure um número de WhatsApp válido em Configurações → Compras.';
  } else if (pendingTitles.length === 0) {
    shareDisabledReason = 'Não há itens pendentes para compartilhar.';
  }
  const shareUrl =
    !shareDisabledReason && currentBoard && whatsappNumber
      ? buildWhatsAppShareUrl(whatsappNumber, buildWhatsAppShareText(currentBoard.list.name, pendingTitles))
      : null;

  return (
    <div
      className="min-h-full"
      style={{ backgroundImage: 'radial-gradient(48rem 18rem at 50% -6rem, hsl(160 55% 48% / 0.14), transparent)' }}
    >
      <div className="mx-auto max-w-2xl p-4 pb-24 md:p-8">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: 'hsl(160 55% 48% / 0.2)', color: 'hsl(160 55% 48%)' }}
          >
            <ShoppingCart size={26} strokeWidth={1.75} />
          </span>
          Compras
        </h1>

        {hasError && <DataErrorNotice isOffline={isOffline} onRetry={() => void runInit()} className="mt-4" />}

        {!hasError && isLoading && !board && (
          <p className="mt-6 text-sm text-gray-500">Carregando suas listas de compras…</p>
        )}

        {!hasError && board && board.length === 0 && (
          <p className="mt-6 text-sm text-gray-500">Preparando suas listas de compras…</p>
        )}

        {currentBoard && board && (
          <>
            <div className="mt-6 flex gap-2" role="tablist" aria-label="Listas de compras">
              {board.map((b) => {
                const active = b.list.id === currentBoard.list.id;
                return (
                  <button
                    key={b.list.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedListId(b.list.id)}
                    className={`min-h-11 rounded-full px-5 text-sm font-medium transition-colors ${
                      active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {b.list.name}
                    {b.pending.length > 0 && (
                      <span className={`ml-1.5 ${active ? 'text-blue-100' : 'text-gray-400'}`}>
                        {b.pending.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleAdd} className="mt-4 flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={newTitle}
                onChange={(e) => {
                  setNewTitle(e.target.value);
                  setCorrection(null);
                }}
                placeholder={`Adicionar item em ${currentBoard.list.name}…`}
                aria-label={`Adicionar item em ${currentBoard.list.name}`}
                autoFocus
                className="min-h-12 min-w-0 flex-1 rounded-2xl border border-gray-300 px-4 text-base outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={!newTitle.trim()}
                className="min-h-12 rounded-2xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Adicionar
              </button>
            </form>

            {correction && (
              <div role="status" className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p>
                  Acho que você quis dizer <strong>{correction.suggestion}</strong>?
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void addItem(correction.suggestion)}
                    className="min-h-11 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white"
                  >
                    Usar “{correction.suggestion}”
                  </button>
                  <button
                    type="button"
                    onClick={() => void addItem(correction.typed)}
                    className="min-h-11 rounded-xl border border-amber-300 bg-white px-4 text-sm font-medium text-amber-900"
                  >
                    Manter “{correction.typed}”
                  </button>
                </div>
              </div>
            )}

            {addError && (
              <p role="alert" className="mt-2 text-xs text-red-600">
                {addError}
              </p>
            )}

            {recurring.length > 0 && (
              <section aria-label="Sugestões" className="mt-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                  <Sparkles size={14} aria-hidden="true" /> Costuma entrar na lista
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {recurring.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => void addItem(s.label)}
                      title={s.reason === 'due' ? 'Já passou do tempo de sempre' : `Adicionado ${s.count} vezes`}
                      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium ${
                        s.reason === 'due'
                          ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                          : 'border-gray-200 bg-white text-gray-700'
                      }`}
                    >
                      <Plus size={14} aria-hidden="true" /> {s.label}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className="mt-4 flex items-center justify-between gap-2">
              {shareUrl ? (
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-green-300 bg-green-50 px-3 text-xs font-medium text-green-800 hover:bg-green-100"
                >
                  <MessageCircle size={14} /> Enviar pelo WhatsApp
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  title={shareDisabledReason ?? undefined}
                  aria-disabled="true"
                  className="inline-flex min-h-11 cursor-not-allowed items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-medium text-gray-400"
                >
                  <MessageCircle size={14} /> Enviar pelo WhatsApp
                </button>
              )}
            </div>

            <ul className="mt-3 space-y-2" aria-label={`Itens de ${currentBoard.list.name}`}>
              {currentBoard.pending.length === 0 && currentBoard.purchased.length === 0 && (
                <li className="rounded-2xl border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
                  Nenhum item em {currentBoard.list.name} ainda. Adicione o primeiro acima.
                </li>
              )}
              {currentBoard.pending.length === 0 && currentBoard.purchased.length > 0 && (
                <li className="rounded-2xl border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
                  Nada pendente em {currentBoard.list.name}. 🎉
                </li>
              )}
              {currentBoard.pending.map((item) => (
                <ShoppingItemRow
                  key={item.id}
                  item={item}
                  otherLists={otherLists}
                  isEditing={editingId === item.id}
                  editingValue={editingValue}
                  onToggle={(i) => void togglePurchased(i)}
                  onStartEdit={startEdit}
                  onEditingValueChange={setEditingValue}
                  onCommitEdit={() => void commitEdit()}
                  onCancelEdit={cancelEdit}
                  onDelete={(i) => void handleDelete(i)}
                  onMove={(i, listId) => void handleMove(i, listId)}
                />
              ))}
            </ul>

            {/* Comprados: recolhidos por padrão. O histórico continua (e alimenta as sugestões). */}
            {currentBoard.purchased.length > 0 && (
              <details className="group mt-6 rounded-2xl border border-gray-200 bg-white/40">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium text-gray-600">
                  <span>Comprados ({currentBoard.purchased.length})</span>
                  <ChevronDown size={18} className="transition group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="space-y-2 px-3 pb-3">
                  <ul className="space-y-2" aria-label={`Comprados de ${currentBoard.list.name}`}>
                    {[...currentBoard.purchased].reverse().map((item) => (
                      <ShoppingItemRow
                        key={item.id}
                        item={item}
                        otherLists={otherLists}
                        isEditing={editingId === item.id}
                        editingValue={editingValue}
                        onToggle={(i) => void togglePurchased(i)}
                        onStartEdit={startEdit}
                        onEditingValueChange={setEditingValue}
                        onCommitEdit={() => void commitEdit()}
                        onCancelEdit={cancelEdit}
                        onDelete={(i) => void handleDelete(i)}
                        onMove={(i, listId) => void handleMove(i, listId)}
                      />
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => void handleClearPurchased()}
                    className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 hover:underline"
                  >
                    <X size={14} /> Limpar comprados ({currentBoard.purchased.length})
                  </button>
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Check, MessageCircle, Pencil, ShoppingCart, Trash2, X } from 'lucide-react';
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
      className={`flex min-h-[52px] items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 ${
        purchased ? 'opacity-60' : ''
      }`}
    >
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={purchased}
          onChange={() => onToggle(item)}
          aria-label={purchased ? `Desmarcar ${itemLabel(item)} como comprado` : `Marcar ${itemLabel(item)} como comprado`}
          className="h-5 w-5 shrink-0 accent-blue-600"
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
            className="min-w-0 flex-1 rounded border border-blue-400 px-2 py-1 text-sm outline-none"
          />
        ) : (
          <span className={`min-w-0 flex-1 truncate text-sm text-gray-800 ${purchased ? 'line-through' : ''}`}>
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
            className="rounded border border-gray-200 bg-white p-1.5 text-xs text-gray-600 outline-none hover:bg-gray-50"
          >
            <option value="">Mover para…</option>
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
            className="rounded p-1.5 text-green-700 hover:bg-green-50"
          >
            <Check size={16} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onStartEdit(item)}
            aria-label={`Editar ${itemLabel(item)}`}
            className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
          >
            <Pencil size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(item)}
          aria-label={`Excluir ${itemLabel(item)}`}
          className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
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

  const [initError, setInitError] = useState<string | null>(null);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    shoppingCmds
      .ensureDefaultLists()
      .then(() => refetch())
      .catch((e) =>
        setInitError(e instanceof Error ? e.message : 'Não foi possível preparar as listas de compras.')
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const [newTitle, setNewTitle] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || !currentBoard) return;
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
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Não foi possível adicionar o item.');
    } finally {
      inputRef.current?.focus();
    }
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
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <ShoppingCart size={24} className="text-blue-600" /> Compras
      </h1>

      {error && <DataErrorNotice isOffline={isOffline} onRetry={refetch} className="mt-4" />}
      {initError && (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {initError}
        </p>
      )}

      {!error && isLoading && !board && (
        <p className="mt-6 text-sm text-gray-500">Carregando suas listas de compras…</p>
      )}

      {!error && board && board.length === 0 && (
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
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
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
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={`Adicionar item em ${currentBoard.list.name}…`}
              aria-label={`Adicionar item em ${currentBoard.list.name}`}
              autoFocus
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={!newTitle.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Adicionar
            </button>
          </form>
          {addError && (
            <p role="alert" className="mt-2 text-xs text-red-600">
              {addError}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between gap-2">
            {shareUrl ? (
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-100"
              >
                <MessageCircle size={14} /> Enviar pelo WhatsApp
              </a>
            ) : (
              <button
                type="button"
                disabled
                title={shareDisabledReason ?? undefined}
                aria-disabled="true"
                className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-400"
              >
                <MessageCircle size={14} /> Enviar pelo WhatsApp
              </button>
            )}

            {currentBoard.purchased.length > 0 && (
              <button
                type="button"
                onClick={() => void handleClearPurchased()}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 hover:underline"
              >
                <X size={14} /> Limpar comprados ({currentBoard.purchased.length})
              </button>
            )}
          </div>

          <ul className="mt-4 space-y-2" aria-label={`Itens de ${currentBoard.list.name}`}>
            {currentBoard.pending.length === 0 && currentBoard.purchased.length === 0 && (
              <li className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
                Nenhum item em {currentBoard.list.name} ainda. Adicione o primeiro acima.
              </li>
            )}
            {[...currentBoard.pending, ...currentBoard.purchased].map((item) => (
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
        </>
      )}
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDeleteDialogProps {
  entityName: string;
  warningText: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/**
 * Diálogo de confirmação forte para exclusões permanentes — nunca
 * `window.confirm`. Exige digitar o nome exato da entidade antes de habilitar
 * o botão final. Único uso atual: exclusão permanente de projeto.
 */
export function ConfirmDeleteDialog({
  entityName,
  warningText,
  confirmLabel = 'Excluir permanentemente',
  onConfirm,
  onClose,
}: ConfirmDeleteDialogProps) {
  const [typedName, setTypedName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = typedName === entityName;

  const handleConfirm = async () => {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir.');
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Excluir permanentemente ${entityName}`}
    >
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b bg-red-50 p-4">
          <h2 className="flex items-center gap-2 font-semibold text-red-800">
            <AlertTriangle size={18} /> Excluir permanentemente
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-gray-500 hover:text-gray-800 disabled:opacity-50"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <p className="text-sm text-gray-700">{warningText}</p>

          <div>
            <label htmlFor="confirm-delete-name" className="block text-xs font-medium text-gray-600">
              Digite <strong>{entityName}</strong> para confirmar
            </label>
            <input
              id="confirm-delete-name"
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              disabled={busy}
              autoComplete="off"
              className="mt-1 w-full rounded-md border p-2 text-sm outline-none focus:border-red-500 disabled:bg-gray-50"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!matches || busy}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Excluindo…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

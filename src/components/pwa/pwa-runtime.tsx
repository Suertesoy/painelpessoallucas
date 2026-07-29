'use client';

import { RefreshCw } from 'lucide-react';
import { useServiceWorker } from '@/lib/use-service-worker';

/**
 * Registra o service worker e mostra o aviso discreto de atualização.
 * Montado uma vez no layout raiz — funciona em toda rota, inclusive
 * públicas (login/callback), sem depender de sessão.
 */
export function PwaRuntime() {
  const { updateAvailable, applyUpdate } = useServiceWorker();

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 border-t border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 sm:flex-row sm:justify-center"
    >
      <span className="flex items-center gap-2 font-medium">
        <RefreshCw size={16} /> Nova versão disponível
      </span>
      <button
        type="button"
        onClick={applyUpdate}
        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
      >
        Atualizar agora
      </button>
    </div>
  );
}

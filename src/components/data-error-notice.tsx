'use client';

import { AlertCircle, WifiOff } from 'lucide-react';

/**
 * Aviso padrão para quando uma useReactiveQuery falha.
 *
 * Mensagem sempre genérica e segura (nunca a string bruta de `error`, que
 * pode conter detalhes internos do Supabase) — só o console recebe o erro
 * completo, via console.error dentro do próprio hook.
 */
export function DataErrorNotice({
  isOffline = false,
  onRetry,
  className = '',
}: {
  isOffline?: boolean;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`rounded-lg border p-4 text-sm ${
        isOffline ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-700'
      } ${className}`}
    >
      <div className="flex items-start gap-2">
        {isOffline ? (
          <WifiOff size={18} className="mt-0.5 shrink-0" />
        ) : (
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
        )}
        <div>
          <p className="font-medium">
            {isOffline ? 'Sem conexão com a internet.' : 'Não foi possível carregar seus dados.'}
          </p>
          <p className="mt-1 text-xs opacity-90">
            {isOffline
              ? 'Os dados serão atualizados automaticamente quando a conexão voltar.'
              : 'Sua sessão ou conexão pode precisar ser atualizada.'}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-lg border border-current/30 bg-white/70 px-3 py-1.5 text-xs font-medium hover:bg-white"
      >
        Tentar novamente
      </button>
    </div>
  );
}

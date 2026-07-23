'use client';

import { useState } from 'react';
import { CheckCircle, Loader2 } from 'lucide-react';

/**
 * Ícone de "concluir" reutilizável para listas de itens (Hoje, Entrada,
 * Agenda, detalhe de projeto). Corrige o defeito relatado: a ação agora tem
 * área de toque adequada (44px), mostra loading, desabilita durante o
 * salvamento e exibe erro em vez de falhar silenciosamente.
 */
export function ItemCompleteButton({
  itemId,
  title,
  isCompleted,
  onComplete,
}: {
  itemId: string;
  title: string;
  isCompleted: boolean;
  onComplete: (id: string) => Promise<unknown>;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isCompleted) {
    return <CheckCircle size={18} className="text-green-500 shrink-0" aria-hidden="true" />;
  }

  const handleClick = async () => {
    setIsPending(true);
    setError(null);
    try {
      await onComplete(itemId);
      // Sucesso: o repositório notifica os assinantes (useReactiveQuery), que
      // reexecutam a consulta e removem o item concluído da lista automaticamente.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao concluir.');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="-m-2.5 flex h-11 w-11 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-green-50 hover:text-green-600 disabled:cursor-not-allowed disabled:opacity-60"
        title="Concluir"
        aria-label={`Concluir ${title}`}
      >
        {isPending ? (
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle size={18} aria-hidden="true" />
        )}
      </button>
      {error && (
        <p role="alert" className="mt-1 max-w-[8rem] text-[11px] leading-tight text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

'use client';

import React, { use, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';

/**
 * Dispara o processamento do documento com IA e acompanha o progresso.
 * A chamada real acontece no servidor (/api/planos/processar).
 */
export default function ProcessarDocumentoPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const startDate = searchParams.get('startDate') ?? undefined;

  const [status, setStatus] = useState<'processing' | 'error'>('processing');
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const attemptsRef = useRef(0);

  // O processamento roda inteiramente no servidor: se o navegador perder a
  // conexão, recarregar a página ou o fetch for interrompido, o servidor
  // continua até concluir. `/api/planos/processar` é idempotente por
  // documento — reenviar a mesma requisição nunca duplica o plano; se já
  // concluiu, devolve o draft existente. Enquanto o servidor ainda está
  // processando (HTTP 409), tentamos de novo automaticamente em vez de
  // mostrar um erro — não é uma falha, é um estado a aguardar.
  const MAX_WAIT_ATTEMPTS = 24; // ~2 minutos (24 × 5s)
  const RETRY_DELAY_MS = 5000;

  useEffect(() => {
    if (startedRef.current) return; // evita disparo duplo no StrictMode
    startedRef.current = true;
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch('/api/planos/processar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId, ...(startDate ? { startDate } : {}) }),
        });
        const json = await res.json();

        if (res.status === 409 && json.stillProcessing) {
          attemptsRef.current += 1;
          if (cancelled) return;
          if (attemptsRef.current >= MAX_WAIT_ATTEMPTS) {
            throw new Error(
              'O processamento está demorando mais que o esperado. Recarregue esta página em alguns minutos — o documento original está preservado.'
            );
          }
          setTimeout(() => {
            if (!cancelled) void run();
          }, RETRY_DELAY_MS);
          return;
        }

        if (!res.ok) {
          throw new Error(json.error ?? `Falha no processamento (HTTP ${res.status})`);
        }
        router.replace(`/planos/${json.planId}/revisar`);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Erro inesperado no processamento.');
        setStatus('error');
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [documentId, startDate, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <div className="max-w-md text-center">
        {status === 'processing' ? (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
              <Sparkles className="text-blue-600" size={24} />
            </div>
            <h1 className="mt-4 text-lg font-semibold">Estruturando o plano com IA…</h1>
            <p className="mt-2 text-sm text-gray-500">
              O documento original já está salvo. A IA está propondo fases, ações e
              rotinas — você revisará tudo antes de qualquer aprovação.
            </p>
            <Loader2 className="mx-auto mt-6 animate-spin text-blue-600" size={24} />
            <p className="mt-2 text-xs text-gray-400">Isso pode levar até 2 minutos.</p>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
              <AlertCircle className="text-red-600" size={24} />
            </div>
            <h1 className="mt-4 text-lg font-semibold">O processamento falhou</h1>
            <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>
            <p className="mt-2 text-sm text-gray-500">
              O documento original está preservado — nada foi perdido.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  startedRef.current = false;
                  setStatus('processing');
                  setError(null);
                  // força reexecução do effect
                  router.refresh();
                  window.location.reload();
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Tentar novamente
              </button>
              <Link
                href="/planos"
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Voltar aos planos
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

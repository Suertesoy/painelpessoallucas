'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useCommands } from '@/providers/repository.provider';

/**
 * Aceite do convite: a pessoa entra com a PRÓPRIA conta Google (o proxy envia
 * para /login e volta aqui) e o banco só aceita se o e-mail confirmado da
 * conta for o do convite. Depois disso o acesso é normal.
 */
export default function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { sharing } = useCommands();
  const [state, setState] = useState<'working' | 'done' | 'error'>('working');
  const [message, setMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    sharing
      .acceptInvite(token)
      .then(() => {
        setState('done');
        // Recarrega para o app resolver o workspace compartilhado como padrão.
        setTimeout(() => window.location.assign('/'), 1200);
      })
      .catch((e: unknown) => {
        setMessage(e instanceof Error ? e.message : 'Convite inválido ou expirado.');
        setState('error');
      });
  }, [sharing, token]);

  return (
    <div className="mx-auto max-w-md p-6 pt-16 text-center">
      <h1 className="text-2xl font-bold">Convite para a casa</h1>
      {state === 'working' && <p className="mt-4 text-base text-gray-600">Conferindo o convite…</p>}
      {state === 'done' && <p role="status" className="mt-4 text-base text-green-700">Pronto! Você já faz parte da casa. Abrindo…</p>}
      {state === 'error' && (
        <div role="alert" className="mt-4 space-y-3">
          <p className="text-base text-red-700">{message}</p>
          <p className="text-sm text-gray-600">Confira se você entrou com a conta Google do e-mail que recebeu o convite, ou peça um novo link.</p>
          <Link href="/" className="inline-flex min-h-11 items-center px-3 text-blue-700">Ir para o início</Link>
        </div>
      )}
    </div>
  );
}

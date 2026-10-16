'use client';

import { useState } from 'react';
import { Copy, Users } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';

const inputClass = 'w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-900 placeholder:text-gray-400';

/**
 * Compartilhamento da casa: quem participa e convite para a segunda pessoa.
 * O convite vale só para o e-mail informado e só uma vez; o link é entregue
 * por você (WhatsApp, por exemplo).
 */
export function SharingCard() {
  const { sharing } = useQueries();
  const commands = useCommands().sharing;
  const members = useReactiveQuery(() => sharing.listMembers(), []);
  const invites = useReactiveQuery(() => sharing.listInvites(), []);
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  const count = members.data?.length ?? 0;
  const full = count >= 2;

  async function createInvite(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setLink(null);
    try {
      setLink(await commands.createInvite(email, window.location.origin));
      setEmail('');
      invites.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o convite.');
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section aria-label="Compartilhamento" className="rounded-2xl border border-gray-200 bg-white p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Users size={18} /> Quem usa a casa</h2>

      {members.error && <p className="mt-3 text-sm text-gray-600">Não foi possível carregar os participantes agora.</p>}
      <ul className="mt-3 space-y-1">
        {(members.data ?? []).map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-3 text-base">
            <span className="min-w-0 truncate">{m.email}</span>
            <span className="text-sm text-gray-500">{m.role === 'owner' ? 'administra' : 'participa'}</span>
          </li>
        ))}
      </ul>

      {(invites.data ?? []).map((i) => (
        <p key={i.id} className="mt-2 flex items-center justify-between gap-3 text-sm text-gray-600">
          <span className="min-w-0 truncate">Convite pendente: {i.email}</span>
          <button
            type="button"
            className="min-h-11 shrink-0 px-2 text-blue-700"
            onClick={async () => { await commands.revokeInvite(i.id); invites.refetch(); }}
          >
            Cancelar
          </button>
        </p>
      ))}

      {!members.error && !full && (
        <form onSubmit={createInvite} className="mt-4 space-y-3">
          <label htmlFor="invite-email" className="block text-sm font-medium">Convidar pelo e-mail da conta Google</label>
          <input
            id="invite-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            required
            className={inputClass}
            placeholder="nome@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" disabled={pending || !email.trim()} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-50">
            {pending ? 'Criando…' : 'Criar convite'}
          </button>
          <p className="text-sm text-gray-500">O link vale por 7 dias, só para este e-mail, e só pode ser usado uma vez.</p>
        </form>
      )}
      {full && <p className="mt-3 text-sm text-gray-500">A casa já tem duas pessoas.</p>}

      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {link && (
        <div className="mt-3 space-y-2 rounded-xl bg-gray-50 p-3">
          <p className="text-sm">Envie este link para a pessoa convidada. Ele só aparece agora.</p>
          <input readOnly aria-label="Link do convite" className={inputClass} value={link} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" onClick={() => void copy()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-300 px-4 text-sm font-medium">
            <Copy size={16} /> {copied ? 'Copiado' : 'Copiar link'}
          </button>
        </div>
      )}
    </section>
  );
}

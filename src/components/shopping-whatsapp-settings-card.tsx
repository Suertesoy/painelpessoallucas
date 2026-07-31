'use client';

import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';

/**
 * "WhatsApp para compartilhar compras" (Configurações). O número nunca é
 * hardcoded — começa vazio em todo workspace e só é preenchido aqui. Mesmo
 * padrão de fetch/save de DigestSettingsCard, numa rota dedicada
 * (/api/settings/shopping) para não sobrescrever as preferências de resumo.
 */
export function ShoppingWhatsappSettingsCard() {
  const [value, setValue] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/settings/shopping');
        if (res.ok) {
          const body = (await res.json()) as { whatsappNumber: string | null };
          setValue(body.whatsappNumber ?? '');
        }
      } catch {
        setError('Não foi possível carregar a configuração.');
      } finally {
        setLoaded(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch('/api/settings/shopping', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsappNumber: value.trim() || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setFeedback('Número salvo.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <MessageCircle size={18} className="text-gray-600" />
        <h3 className="font-semibold">WhatsApp para compartilhar compras</h3>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Usado pelo botão &quot;Enviar pelo WhatsApp&quot; em Compras. Inclua o código do
        país — ex.: +55 11 91234-5678.
      </p>

      <div className="mt-4">
        <label className="text-xs text-gray-500" htmlFor="shopping-whatsapp-number">
          Número
        </label>
        <input
          id="shopping-whatsapp-number"
          type="tel"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="+55 11 91234-5678"
          disabled={!loaded}
          className="mt-1 w-full max-w-xs rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
        />
      </div>

      {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
      {feedback && <p role="status" className="mt-3 text-xs text-green-700">{feedback}</p>}

      <div className="mt-4">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !loaded}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          Salvar número
        </button>
      </div>
    </div>
  );
}

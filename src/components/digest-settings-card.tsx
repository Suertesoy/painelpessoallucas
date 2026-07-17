'use client';

import { useEffect, useState } from 'react';
import { Mail, Send } from 'lucide-react';

interface DigestSettings {
  daily_digest_enabled: boolean;
  daily_digest_time: string;
  weekly_digest_enabled: boolean;
  weekly_digest_day: number;
  weekly_digest_time: string;
  critical_alerts_enabled: boolean;
  digest_recipient: string | null;
}

const WEEK_DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function DigestSettingsCard() {
  const [settings, setSettings] = useState<DigestSettings | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/settings/digest');
        if (res.ok) setSettings((await res.json()) as DigestSettings);
      } catch {
        setError('Não foi possível carregar as preferências.');
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  if (!settings) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500">
        Carregando preferências de resumo…
      </div>
    );
  }

  const update = (patch: Partial<DigestSettings>) =>
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));

  const save = async () => {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch('/api/settings/digest', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          daily_digest_time: settings.daily_digest_time.slice(0, 5),
          weekly_digest_time: settings.weekly_digest_time.slice(0, 5),
          digest_recipient: settings.digest_recipient || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      setFeedback('Preferências salvas.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async (kind: 'daily' | 'weekly') => {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch('/api/integrations/gmail/send-digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setFeedback(`Resumo ${kind === 'daily' ? 'diário' : 'semanal'} enviado para ${json.to}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha no envio de teste.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Mail size={18} className="text-gray-600" />
        <h3 className="font-semibold">Resumos por e-mail</h3>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Nada é enviado sem você ativar. Requer o Gmail conectado acima.
      </p>

      <div className="mt-4 space-y-3 text-sm">
        <label className="flex flex-wrap items-center gap-2">
          <input
            type="checkbox"
            checked={settings.daily_digest_enabled}
            onChange={(e) => update({ daily_digest_enabled: e.target.checked })}
          />
          Resumo diário às
          <input
            type="time"
            value={settings.daily_digest_time.slice(0, 5)}
            onChange={(e) => update({ daily_digest_time: e.target.value })}
            className="rounded border border-gray-300 px-2 py-1 text-xs"
            aria-label="Horário do resumo diário"
          />
        </label>

        <label className="flex flex-wrap items-center gap-2">
          <input
            type="checkbox"
            checked={settings.weekly_digest_enabled}
            onChange={(e) => update({ weekly_digest_enabled: e.target.checked })}
          />
          Resumo semanal:
          <select
            value={settings.weekly_digest_day}
            onChange={(e) => update({ weekly_digest_day: Number(e.target.value) })}
            className="rounded border border-gray-300 px-2 py-1 text-xs"
            aria-label="Dia do resumo semanal"
          >
            {WEEK_DAYS.map((d, i) => (
              <option key={i} value={i}>{d}</option>
            ))}
          </select>
          às
          <input
            type="time"
            value={settings.weekly_digest_time.slice(0, 5)}
            onChange={(e) => update({ weekly_digest_time: e.target.value })}
            className="rounded border border-gray-300 px-2 py-1 text-xs"
            aria-label="Horário do resumo semanal"
          />
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.critical_alerts_enabled}
            onChange={(e) => update({ critical_alerts_enabled: e.target.checked })}
          />
          Alertas de prazos críticos e falhas de automação
        </label>

        <label className="flex flex-wrap items-center gap-2">
          Destinatário:
          <input
            type="email"
            placeholder="(padrão: e-mail da conta Gmail)"
            value={settings.digest_recipient ?? ''}
            onChange={(e) => update({ digest_recipient: e.target.value || null })}
            className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
            aria-label="Destinatário dos resumos"
          />
        </label>
      </div>

      {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
      {feedback && <p role="status" className="mt-3 text-xs text-green-700">{feedback}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          Salvar preferências
        </button>
        <button
          type="button"
          onClick={() => void sendTest('daily')}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <Send size={14} /> Testar resumo diário
        </button>
        <button
          type="button"
          onClick={() => void sendTest('weekly')}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <Send size={14} /> Testar resumo semanal
        </button>
      </div>
    </div>
  );
}

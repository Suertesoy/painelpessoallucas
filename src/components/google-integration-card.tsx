'use client';

import { useCallback, useEffect, useState } from 'react';
import { Calendar, Mail, CheckCircle, AlertCircle, RefreshCw, Unplug } from 'lucide-react';

type Service = 'calendar' | 'gmail';

interface StatusResponse {
  status: 'connected' | 'revoked' | 'error' | 'disconnected';
  email?: string;
  connectedAt?: string;
  lastVerifiedAt?: string;
  lastError?: string | null;
}

const SERVICE_META: Record<Service, { title: string; description: string }> = {
  calendar: {
    title: 'Google Calendar',
    description:
      'Cria e administra o calendário "Painel Lucas" e consulta sua disponibilidade. Não pede acesso total à agenda.',
  },
  gmail: {
    title: 'Gmail',
    description:
      'Somente envio de resumos (diário/semanal/alertas) para você mesmo. Sem leitura da caixa de entrada.',
  },
};

export function GoogleIntegrationCard({ service }: { service: Service }) {
  const meta = SERVICE_META[service];
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (verify = false) => {
    try {
      const res = await fetch(
        `/api/integrations/google/status?service=${service}${verify ? '&verify=1' : ''}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus((await res.json()) as StatusResponse);
      setError(null);
    } catch {
      setError('Não foi possível consultar o status da conexão.');
    } finally {
      setIsVerifying(false);
    }
  }, [service]);

  useEffect(() => {
    // setState apenas em callbacks assíncronos (regra set-state-in-effect)
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const verifyNow = () => {
    setIsVerifying(true);
    setError(null);
    void load(true);
  };

  const disconnect = async () => {
    setError(null);
    try {
      const res = await fetch('/api/integrations/google/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch {
      setError('Falha ao desconectar. Tente novamente.');
    }
  };

  const connected = status?.status === 'connected';
  const revoked = status?.status === 'revoked' || status?.status === 'error';
  const Icon = service === 'calendar' ? Calendar : Mail;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-gray-100 p-2">
          <Icon size={20} className="text-gray-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{meta.title}</h3>
            {connected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                <CheckCircle size={12} /> Conectado
              </span>
            )}
            {revoked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                <AlertCircle size={12} /> Reconexão necessária
              </span>
            )}
            {status?.status === 'disconnected' && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                Desconectado
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">{meta.description}</p>
          {connected && status?.email && (
            <p className="mt-1 text-xs text-gray-400">Conta: {status.email}</p>
          )}
          {revoked && status?.lastError && (
            <p className="mt-1 text-xs text-red-600">
              A conexão precisa ser refeita: {status.lastError}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {!connected && (
              <a
                href={`/api/integrations/google/connect?service=${service}`}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                {revoked ? 'Reconectar' : `Conectar ${meta.title}`}
              </a>
            )}
            {connected && (
              <>
                <button
                  type="button"
                  onClick={verifyNow}
                  disabled={isVerifying}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  <RefreshCw size={14} className={isVerifying ? 'animate-spin' : ''} />
                  Verificar conexão
                </button>
                <button
                  type="button"
                  onClick={() => void disconnect()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <Unplug size={14} /> Desconectar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

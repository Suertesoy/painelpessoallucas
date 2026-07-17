'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '@/providers/auth.provider';
import { GoogleIntegrationCard } from '@/components/google-integration-card';
import { DigestSettingsCard } from '@/components/digest-settings-card';

function ConfiguracoesContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const integracaoOk = searchParams.get('integracao_ok');
  const integracaoErro = searchParams.get('integracao_erro');

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Configurações</h1>

      {integracaoOk && (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          <CheckCircle size={16} />
          {integracaoOk === 'calendar' ? 'Google Calendar conectado.' : 'Gmail conectado.'}
        </p>
      )}
      {integracaoErro && (
        <p role="alert" className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={16} /> Falha na conexão: {integracaoErro}
        </p>
      )}

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Conta</h2>
        <p className="mt-2 text-sm text-gray-600">
          Conectado como <span className="font-medium">{user?.email}</span>
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Integrações</h2>
        <p className="mt-1 text-sm text-gray-500">
          Conexões separadas do login, com os menores escopos possíveis. Você pode
          desconectar a qualquer momento.
        </p>
        <div className="mt-4 space-y-4">
          <GoogleIntegrationCard service="calendar" />
          <GoogleIntegrationCard service="gmail" />
          <DigestSettingsCard />
        </div>
      </section>
    </div>
  );
}

export default function ConfiguracoesPage() {
  return (
    <Suspense>
      <ConfiguracoesContent />
    </Suspense>
  );
}

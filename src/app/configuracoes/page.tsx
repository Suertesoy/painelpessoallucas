'use client';

import { useAuth } from '@/providers/auth.provider';

export default function ConfiguracoesPage() {
  const { user } = useAuth();

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Conta</h2>
        <p className="mt-2 text-sm text-gray-600">
          Conectado como <span className="font-medium">{user?.email}</span>
        </p>
      </section>

      <section className="mt-4 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Integrações</h2>
        <p className="mt-2 text-sm text-gray-500">
          Conexões com Google Calendar e Gmail chegam nas próximas etapas desta fase.
        </p>
      </section>
    </div>
  );
}

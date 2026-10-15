'use client';

import { useAuth } from '@/providers/auth.provider';
import { ShoppingWhatsappSettingsCard } from '@/components/shopping-whatsapp-settings-card';
import { RoutineSettingsCard } from '@/components/routine-settings-card';
import { AutomationHealthCard } from '@/components/automation-health-card';
import { InstallAppCard } from '@/components/pwa/install-app-card';
import { PushNotificationsCard } from '@/components/push/push-notifications-card';

/**
 * Configurações da casa: só o que se usa no dia a dia. Integrações antigas
 * (Google Calendar, Gmail, resumos por e-mail) e opções técnicas não ficam na
 * tela principal; os componentes continuam no código e os dados, preservados.
 */
export default function ConfiguracoesPage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 pb-28 md:p-8">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Conta</h2>
        <p className="mt-2 text-base text-gray-600">
          Conectado como <span className="font-medium">{user?.email}</span>
        </p>
      </section>

      <section aria-label="Compras">
        <ShoppingWhatsappSettingsCard />
      </section>

      <section aria-label="Aplicativo no celular">
        <InstallAppCard />
      </section>

      <section aria-label="Notificações">
        <PushNotificationsCard />
      </section>

      <details className="rounded-2xl border border-gray-200 bg-white">
        <summary className="min-h-11 cursor-pointer p-5 text-lg font-semibold">Avançado</summary>
        <div className="space-y-4 border-t border-gray-200 p-5">
          <p className="text-sm text-gray-600">Opções técnicas das automações. Não são necessárias para o uso diário.</p>
          <AutomationHealthCard />
          <RoutineSettingsCard />
        </div>
      </details>
    </div>
  );
}

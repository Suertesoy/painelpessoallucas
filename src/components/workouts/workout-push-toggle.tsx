'use client';

import { Bell, BellOff, CheckCircle2, Info, Share } from 'lucide-react';
import { usePushNotifications } from '@/lib/use-push-notifications';
import { useRestAlertStatus } from '@/lib/use-rest-alert-status';

/**
 * "Avisar quando o descanso terminar" — preferência DESTE dispositivo (cada
 * aparelho de Lucas ou de Matheus liga/desliga o seu), reusando a assinatura
 * Web Push já existente. Nunca pede permissão ao iOS sem um toque explícito,
 * e se a permissão já foi concedida o `activate` não abre outro pedido.
 * Nada aqui bloqueia o treino: sem push, o cronômetro da tela segue igual.
 */
export function WorkoutPushToggle({ athleteId }: { athleteId: string }) {
  const push = usePushNotifications();
  const status = useRestAlertStatus(athleteId);

  const canActivate = push.state === 'permission_default' || push.state === 'permission_granted_no_subscription' || push.state === 'subscription_lost';
  const isEnabled = push.state === 'subscribed' && (push.preferences?.workoutRestEnabled ?? false);

  const toggle = async () => {
    if (push.state === 'subscribed') {
      await push.updatePreferences({ workoutRestEnabled: !isEnabled });
    } else if (canActivate) {
      await push.activate({ workoutRestEnabled: true });
    }
  };

  return (
    <section aria-label="Avisos de descanso" className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isEnabled ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
            <Bell size={18} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Avisar quando o descanso terminar</h2>
            <p className="mt-0.5 text-xs text-gray-500">Notificação neste aparelho no fim do descanso, mesmo com a tela bloqueada.</p>
          </div>
        </div>

        {push.state === 'subscribed' ? (
          <label className="relative inline-flex shrink-0 cursor-pointer items-center">
            <input
              type="checkbox"
              role="switch"
              aria-label="Avisar quando o descanso terminar"
              checked={isEnabled}
              disabled={push.busy || !push.preferences}
              onChange={() => void toggle()}
              className="peer sr-only"
            />
            <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-disabled:opacity-50"></div>
          </label>
        ) : canActivate ? (
          <button
            type="button"
            onClick={() => void toggle()}
            disabled={push.busy}
            className="min-h-11 shrink-0 rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {push.busy ? 'Ativando…' : 'Ativar'}
          </button>
        ) : null}
      </div>

      {isEnabled && status?.athlete !== 'unlinked' && status?.ready !== false && (
        <p className="mt-2.5 flex items-center gap-1.5 text-xs text-emerald-700">
          <CheckCircle2 size={14} aria-hidden="true" /> Avisos automáticos ativos neste aparelho.
        </p>
      )}

      {status && !status.ready && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Os avisos de descanso ainda não foram configurados no servidor. O cronômetro na tela funciona normalmente.
        </p>
      )}

      {status?.ready && status.athlete === 'unlinked' && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Este perfil de treino ainda não está vinculado a uma conta, então nenhum aviso será enviado para ele.
        </p>
      )}

      {status?.ready && status.athlete === 'other' && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-gray-50 p-3 text-xs text-gray-700">
          <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Os avisos dos descansos deste perfil vão para o aparelho da pessoa dona dele, não para este.
        </p>
      )}

      {push.state === 'ios_not_installed' && (
        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          <p className="flex items-center gap-1.5 font-medium">
            <Share size={14} className="shrink-0 text-amber-700" aria-hidden="true" />
            No iPhone, os avisos com a tela bloqueada exigem o Lutheus na Tela de Início.
          </p>
          <p className="mt-1 text-amber-800">No Safari, toque em Compartilhar › Adicionar à Tela de Início e abra pelo ícone.</p>
        </div>
      )}

      {push.state === 'permission_denied' && (
        <div className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-900">
          <p className="flex items-center gap-1.5 font-medium">
            <BellOff size={14} className="shrink-0 text-red-700" aria-hidden="true" />
            As notificações do Lutheus estão bloqueadas neste aparelho.
          </p>
          <p className="mt-1 text-red-800">Para liberar: Ajustes do iPhone › Notificações › Lutheus › Permitir Notificações.</p>
        </div>
      )}

      {push.error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {push.error}
        </p>
      )}
    </section>
  );
}

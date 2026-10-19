'use client';

import { useState } from 'react';
import { Bell, BellOff, Send, Smartphone, Trash2, AlertCircle, CheckCircle2, Share } from 'lucide-react';
import { usePushNotifications } from '@/lib/use-push-notifications';

const WEEK_DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const PLATFORM_LABEL: Record<string, string> = {
  ios: 'iPhone/iPad',
  android: 'Android',
  desktop: 'Computador',
  other: 'Dispositivo',
};

function formatLastSeen(iso: string | null): string {
  if (!iso) return 'Nunca visto';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Card "Notificações neste dispositivo" — amplia Configurações (mesma
 * identidade visual de InstallAppCard/DigestSettingsCard). A permissão
 * NUNCA é solicitada automaticamente: tudo começa pelo clique explícito em
 * "Ativar notificações".
 */
export function PushNotificationsCard() {
  const push = usePushNotifications();
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testingTarget, setTestingTarget] = useState<string | null>(null);

  const handleTest = async (targetId?: string, delaySeconds = 0) => {
    const key = targetId ?? (delaySeconds > 0 ? 'delay' : 'self');
    setTestingTarget(key);
    setTestStatus(null);
    try {
      if (delaySeconds > 0) {
        setTestStatus('Solicitação enviada. O servidor disparará em 5 segundos. Bloqueie a tela do iPhone agora e aguarde.');
      }
      await push.sendTest(targetId, delaySeconds);
      if (delaySeconds === 0) {
        setTestStatus(
          targetId
            ? 'Envio solicitado com sucesso pelo servidor para o dispositivo selecionado. Verifique se a notificação chegou.'
            : 'Envio solicitado com sucesso pelo servidor. Verifique se o iPhone exibiu a notificação.'
        );
      }
      setTimeout(() => setTestStatus(null), 8000);
    } catch {
      setTestStatus(null);
    } finally {
      setTestingTarget(null);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Bell size={18} className="text-gray-400" />
        Notificações neste dispositivo
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        Lembretes de tarefa, avisos para organizar o dia e revisar a semana, e alertas quando
        uma captura precisar de atenção — só neste dispositivo, e só nas categorias que você
        escolher abaixo.
      </p>

      {push.state === 'unsupported' && (
        <p className="mt-3 text-sm text-gray-500">
          Este navegador não é compatível com notificações push.
        </p>
      )}

      {push.state === 'vapid_missing' && (
        <p className="mt-3 flex items-center gap-2 text-sm text-amber-700">
          <AlertCircle size={16} /> Notificações push ainda não foram configuradas neste ambiente.
        </p>
      )}

      {push.state === 'ios_not_installed' && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
          <p className="flex items-start gap-2 font-medium">
            <Share size={16} className="mt-0.5 shrink-0 text-amber-700" />
            No iPhone ou iPad, notificações só funcionam com o Lutheus na Tela de Início.
          </p>
          <ol className="mt-2 ml-6 list-decimal space-y-1 text-xs text-amber-800">
            <li>Abra este site no Safari (não no Chrome ou aba anônima).</li>
            <li>Toque no botão de <strong>Compartilhar</strong> (ícone do quadrado com seta para cima).</li>
            <li>Role e escolha <strong>&quot;Adicionar à Tela de Início&quot;</strong>.</li>
            <li>Abra o Lutheus pelo ícone criado na Tela de Início e retorne aqui para ativar.</li>
          </ol>
        </div>
      )}

      {push.state === 'permission_denied' && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-900">
          <p className="flex items-start gap-2 font-medium">
            <BellOff size={16} className="mt-0.5 shrink-0 text-red-700" />
            A permissão de notificações foi negada neste dispositivo.
          </p>
          <p className="mt-1 text-xs text-red-800">
            Para recuperar e permitir o recebimento de notificações:
          </p>
          <ul className="mt-1 ml-5 list-disc space-y-1 text-xs text-red-800">
            <li>
              <strong>No iPhone (app na Tela de Início):</strong> abra <em>Ajustes do iPhone</em> &gt; <em>Notificações</em> &gt; <em>Lutheus</em> e ative <strong>Permitir Notificações</strong>.
            </li>
            <li>
              <strong>No navegador:</strong> acesse as permissões do site nas configurações do navegador e redefina Notificações para <strong>Permitir</strong>.
            </li>
          </ul>
        </div>
      )}

      {(push.state === 'permission_default' ||
        push.state === 'permission_granted_no_subscription' ||
        push.state === 'subscription_lost' ||
        push.state === 'error') && (
        <div className="mt-3">
          {push.state === 'subscription_lost' && (
            <p className="mb-2 text-xs text-amber-700">
              A assinatura deste dispositivo foi perdida (ex.: dados do navegador limpos). Ative
              novamente para continuar recebendo.
            </p>
          )}
          {push.state === 'error' && (
            <p className="mb-2 text-xs text-red-600">
              Não foi possível ativar as notificações. Tente novamente.
            </p>
          )}
          <button
            type="button"
            onClick={() => void push.activate()}
            disabled={push.busy}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Bell size={16} /> {push.busy ? 'Ativando…' : 'Ativar notificações'}
          </button>
        </div>
      )}

      {push.state === 'subscribed' && push.preferences && (
        <div className="mt-4 space-y-4">
          <p className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 size={16} /> Ativado em {push.preferences.deviceName} (
            {PLATFORM_LABEL[push.preferences.platform] ?? push.preferences.platform}).
          </p>

          <div className="space-y-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={push.preferences.taskRemindersEnabled}
                onChange={(e) => void push.updatePreferences({ taskRemindersEnabled: e.target.checked })}
              />
              Lembretes de tarefa com data e horário definidos
            </label>

            <label className="flex flex-wrap items-center gap-2">
              <input
                type="checkbox"
                checked={push.preferences.dailyPlanningEnabled}
                onChange={(e) => void push.updatePreferences({ dailyPlanningEnabled: e.target.checked })}
              />
              Organizar o dia às
              <input
                type="time"
                value={push.preferences.dailyPlanningTime}
                onChange={(e) => void push.updatePreferences({ dailyPlanningTime: e.target.value })}
                className="rounded border border-gray-300 px-2 py-1 text-xs"
                aria-label="Horário do aviso diário"
              />
            </label>

            <label className="flex flex-wrap items-center gap-2">
              <input
                type="checkbox"
                checked={push.preferences.weeklyReviewEnabled}
                onChange={(e) => void push.updatePreferences({ weeklyReviewEnabled: e.target.checked })}
              />
              Revisar a semana:
              <select
                value={push.preferences.weeklyReviewDay}
                onChange={(e) => void push.updatePreferences({ weeklyReviewDay: Number(e.target.value) })}
                className="rounded border border-gray-300 px-2 py-1 text-xs"
                aria-label="Dia da revisão semanal"
              >
                {WEEK_DAYS.map((d, i) => (
                  <option key={i} value={i}>
                    {d}
                  </option>
                ))}
              </select>
              às
              <input
                type="time"
                value={push.preferences.weeklyReviewTime}
                onChange={(e) => void push.updatePreferences({ weeklyReviewTime: e.target.value })}
                className="rounded border border-gray-300 px-2 py-1 text-xs"
                aria-label="Horário da revisão semanal"
              />
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={push.preferences.captureFailureEnabled}
                onChange={(e) => void push.updatePreferences({ captureFailureEnabled: e.target.checked })}
              />
              Avisar quando uma captura precisar de atenção
            </label>

            <label className="flex items-center gap-2 border-t border-gray-100 pt-3">
              <input
                type="checkbox"
                checked={push.preferences.showDetailsEnabled}
                onChange={(e) => void push.updatePreferences({ showDetailsEnabled: e.target.checked })}
              />
              Mostrar detalhes nas notificações (ex.: título da tarefa)
            </label>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={Boolean(testingTarget)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              <Send size={14} /> {testingTarget === 'self' ? 'Enviando…' : 'Enviar notificação de teste'}
            </button>
            <button
              type="button"
              onClick={() => void handleTest(undefined, 5)}
              disabled={Boolean(testingTarget)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              title="Dispara a notificação após 5 segundos para você poder bloquear a tela e testar som/fones"
            >
              <Send size={14} /> {testingTarget === 'delay' ? 'Aguardando 5s…' : 'Testar com tela bloqueada (em 5s)'}
            </button>
            <button
              type="button"
              onClick={() => void push.deactivate()}
              disabled={push.busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              <BellOff size={14} /> Desativar neste dispositivo
            </button>
          </div>
        </div>
      )}

      {push.error && (
        <p role="alert" className="mt-3 text-xs text-red-600">
          {push.error}
        </p>
      )}
      {testStatus && !push.error && (
        <p role="status" className="mt-3 rounded-md bg-blue-50 p-2.5 text-xs text-blue-900 border border-blue-200">
          {testStatus}
        </p>
      )}

      {push.devices.length > 0 && (
        <div className="mt-5 border-t border-gray-100 pt-4">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <Smartphone size={14} /> Dispositivos registrados
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Você pode disparar um teste para o iPhone a partir deste computador mesmo se o telefone estiver com a tela bloqueada.
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {push.devices.map((device) => (
              <li
                key={device.id}
                className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs"
              >
                <span className="text-gray-700">
                  {device.deviceName} · {PLATFORM_LABEL[device.platform] ?? device.platform}
                  {!device.isActive && <span className="ml-1 text-gray-400">(desativado)</span>}
                  <span className="ml-2 text-gray-400">{formatLastSeen(device.lastSeenAt)}</span>
                </span>
                <div className="flex items-center gap-2">
                  {device.isActive && (
                    <button
                      type="button"
                      onClick={() => void handleTest(device.id)}
                      disabled={Boolean(testingTarget)}
                      className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                      title={`Enviar notificação de teste para ${device.deviceName}`}
                    >
                      <Send size={11} /> {testingTarget === device.id ? 'Enviando…' : 'Testar'}
                    </button>
                  )}
                  {device.isActive && (
                    <button
                      type="button"
                      onClick={() => void push.revokeDevice(device.id)}
                      className="flex items-center gap-1 text-gray-500 hover:text-red-600"
                      aria-label={`Revogar ${device.deviceName}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

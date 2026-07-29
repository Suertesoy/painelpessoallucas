'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getPushSubscriptionController } from '@/platform/push/push-subscription.controller';
import { guessDeviceName, guessPlatform } from '@/platform/push/device-info';
import type { PushPreferences, UpdatePushPreferencesDTO } from '@/platform/push/push-preferences.schema';

/**
 * Hook único que combina `PushSubscriptionController` (estado do
 * navegador) com as rotas server-side (preferências, dispositivos, teste).
 * Nenhum componente deve chamar `fetch('/api/push/...')` diretamente —
 * tudo passa por aqui, mesmo padrão de `useCommands`/`useQueries` para o
 * resto do painel (esta área é infraestrutura de dispositivo, não domínio
 * do workspace, por isso rotas server-side em vez de Commands/Queries).
 */

const SUBSCRIPTION_ID_KEY = 'ppl:push-subscription-id';

export interface DeviceSummary {
  id: string;
  deviceName: string;
  platform: string;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

function readStoredSubscriptionId(): string | null {
  try {
    return window.localStorage.getItem(SUBSCRIPTION_ID_KEY);
  } catch {
    return null;
  }
}

function storeSubscriptionId(id: string): void {
  try {
    window.localStorage.setItem(SUBSCRIPTION_ID_KEY, id);
  } catch {
    // Degrada sem quebrar (ex.: modo privado).
  }
}

function clearStoredSubscriptionId(): void {
  try {
    window.localStorage.removeItem(SUBSCRIPTION_ID_KEY);
  } catch {
    // Ignorado de propósito.
  }
}

export function usePushNotifications() {
  const controller = getPushSubscriptionController();
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  // Lê o marcador local uma única vez, na inicialização preguiçosa do estado
  // (em vez de um efeito) — não há sistema externo para "sincronizar" aqui,
  // só o valor inicial de uma leitura síncrona do localStorage.
  const [subscriptionId, setSubscriptionId] = useState<string | null>(() => readStoredSubscriptionId());
  const [preferences, setPreferences] = useState<PushPreferences | null>(null);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    controller.start(vapidPublicKey);
  }, [controller, vapidPublicKey]);

  const loadDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/push/devices');
      if (res.ok) {
        const body = (await res.json()) as { devices: DeviceSummary[] };
        setDevices(body.devices ?? []);
      }
    } catch {
      // Best-effort: a lista de dispositivos nunca deve travar o card.
    }
  }, []);

  const loadPreferences = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/push/preferences?id=${encodeURIComponent(id)}`);
      if (res.ok) {
        setPreferences((await res.json()) as PushPreferences);
      } else if (res.status === 404) {
        clearStoredSubscriptionId();
        setSubscriptionId(null);
        setPreferences(null);
      }
    } catch {
      setError('Não foi possível carregar as preferências deste dispositivo.');
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void loadDevices(), 0);
    return () => clearTimeout(timer);
  }, [loadDevices]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (snapshot.state === 'subscribed' && subscriptionId) {
        void loadPreferences(subscriptionId);
      } else {
        setPreferences(null);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [snapshot.state, subscriptionId, loadPreferences]);

  /** Só deve ser chamado a partir de um clique explícito do usuário. */
  const activate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const rawSubscription = await controller.requestPermissionAndSubscribe();
      if (!rawSubscription) return;

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: rawSubscription.toJSON(),
          deviceName: guessDeviceName(),
          platform: guessPlatform(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Falha ao registrar assinatura.');

      const body = (await res.json()) as { subscriptionId: string };
      storeSubscriptionId(body.subscriptionId);
      setSubscriptionId(body.subscriptionId);
      await loadPreferences(body.subscriptionId);
      await loadDevices();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ativar as notificações.');
    } finally {
      setBusy(false);
    }
  }, [controller, loadPreferences, loadDevices]);

  const updatePreferences = useCallback(
    async (patch: UpdatePushPreferencesDTO) => {
      if (!subscriptionId) return;
      setPreferences((prev) => (prev ? { ...prev, ...patch } : prev));
      try {
        const res = await fetch(`/api/push/preferences?id=${encodeURIComponent(subscriptionId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Falha ao salvar preferências.');
        setPreferences((await res.json()) as PushPreferences);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao salvar preferências.');
      }
    },
    [subscriptionId]
  );

  const deactivate = useCallback(async () => {
    if (!subscriptionId) return;
    setBusy(true);
    setError(null);
    try {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: subscriptionId }),
      });
      await controller.unsubscribeBrowser();
      clearStoredSubscriptionId();
      setSubscriptionId(null);
      setPreferences(null);
      await loadDevices();
    } finally {
      setBusy(false);
    }
  }, [controller, subscriptionId, loadDevices]);

  const revokeDevice = useCallback(
    async (id: string) => {
      await fetch(`/api/push/devices/${encodeURIComponent(id)}/revoke`, { method: 'POST' });
      if (id === subscriptionId) {
        await controller.unsubscribeBrowser();
        clearStoredSubscriptionId();
        setSubscriptionId(null);
        setPreferences(null);
      }
      await loadDevices();
    },
    [controller, subscriptionId, loadDevices]
  );

  const sendTest = useCallback(async () => {
    if (!subscriptionId) return;
    setError(null);
    try {
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: subscriptionId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Falha ao enviar teste.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar a notificação de teste.');
    }
  }, [subscriptionId]);

  return {
    ...snapshot,
    vapidConfigured: Boolean(vapidPublicKey),
    subscriptionId,
    preferences,
    devices,
    busy,
    error,
    activate,
    updatePreferences,
    deactivate,
    revokeDevice,
    sendTest,
  };
}

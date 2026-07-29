'use client';

import { detectIOS, detectStandalone } from '@/platform/pwa/pwa-install.controller';
import { urlBase64ToUint8Array } from './vapid-key';

/**
 * Estado de Web Push, centralizado num único observável (mesmo padrão de
 * `PwaInstallController`/`ServiceWorkerController`: subscribe + snapshot
 * para `useSyncExternalStore`). Nenhum componente deve ler `Notification`,
 * `PushManager` ou `navigator.serviceWorker` diretamente — tudo passa por
 * aqui. Usa o service worker JÁ registrado por `ServiceWorkerController`
 * (nunca registra um segundo).
 *
 * A reconciliação com o servidor (enviar a assinatura, atualizar
 * last_seen_at, buscar/gravar preferências) fica fora deste controller de
 * propósito — ele só conhece o navegador; quem chama a API é o hook
 * `usePushNotifications` (src/lib/use-push-notifications.ts).
 */
export type PushSubscriptionState =
  | 'unsupported'
  | 'ios_not_installed'
  | 'vapid_missing'
  | 'sw_not_ready'
  | 'permission_default'
  | 'permission_denied'
  | 'permission_granted_no_subscription'
  | 'subscribed'
  | 'subscription_lost'
  | 'error';

export interface PushSubscriptionSnapshot {
  state: PushSubscriptionState;
  /** Só preenchido quando state === 'subscribed'. */
  endpoint: string | null;
}

const LOST_MARKER_KEY = 'ppl:push-subscribed-before';

const INITIAL_SNAPSHOT: PushSubscriptionSnapshot = { state: 'unsupported', endpoint: null };

function browserSupportsWebPush(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function markSubscribedBefore(): void {
  try {
    window.localStorage.setItem(LOST_MARKER_KEY, '1');
  } catch {
    // Armazenamento indisponível (modo privado etc.) — degrada sem quebrar.
  }
}

function clearSubscribedBeforeMarker(): void {
  try {
    window.localStorage.removeItem(LOST_MARKER_KEY);
  } catch {
    // Ignorado de propósito.
  }
}

function wasSubscribedBefore(): boolean {
  try {
    return window.localStorage.getItem(LOST_MARKER_KEY) === '1';
  } catch {
    return false;
  }
}

export class PushSubscriptionController {
  private listeners = new Set<() => void>();
  private snapshot: PushSubscriptionSnapshot = INITIAL_SNAPSHOT;
  private vapidPublicKey: string | undefined;
  private started = false;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): PushSubscriptionSnapshot => this.snapshot;
  getServerSnapshot = (): PushSubscriptionSnapshot => INITIAL_SNAPSHOT;

  /** Detecta suporte/estado inicial e, se a permissão já foi concedida,
   * reconcilia com uma assinatura existente — nunca solicita permissão. */
  start(vapidPublicKey: string | undefined): void {
    this.vapidPublicKey = vapidPublicKey;
    if (this.started) return;
    this.started = true;
    void this.detectInitialState();
  }

  private async detectInitialState(): Promise<void> {
    if (!browserSupportsWebPush()) {
      this.update({ state: 'unsupported', endpoint: null });
      return;
    }

    if (detectIOS() && !detectStandalone()) {
      this.update({ state: 'ios_not_installed', endpoint: null });
      return;
    }

    if (!this.vapidPublicKey) {
      this.update({ state: 'vapid_missing', endpoint: null });
      return;
    }

    const permission = Notification.permission;
    if (permission === 'denied') {
      this.update({ state: 'permission_denied', endpoint: null });
      return;
    }
    if (permission === 'default') {
      this.update({ state: 'permission_default', endpoint: null });
      return;
    }

    // Permissão já concedida numa sessão anterior: reconcilia sem pedir de novo.
    await this.reconcileExisting();
  }

  /** Recarrega o estado a partir de uma assinatura já existente (ou não). */
  async reconcileExisting(): Promise<void> {
    if (!browserSupportsWebPush()) return;
    if (Notification.permission !== 'granted') return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        markSubscribedBefore();
        this.update({ state: 'subscribed', endpoint: subscription.endpoint });
      } else if (wasSubscribedBefore()) {
        this.update({ state: 'subscription_lost', endpoint: null });
      } else {
        this.update({ state: 'permission_granted_no_subscription', endpoint: null });
      }
    } catch {
      this.update({ state: 'sw_not_ready', endpoint: null });
    }
  }

  /** Só deve ser chamado a partir de uma ação explícita do usuário (clique). */
  async requestPermissionAndSubscribe(): Promise<PushSubscription | null> {
    if (!browserSupportsWebPush() || (detectIOS() && !detectStandalone()) || !this.vapidPublicKey) {
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      this.update({ state: permission === 'denied' ? 'permission_denied' : 'permission_default', endpoint: null });
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(this.vapidPublicKey) as BufferSource,
      });
      markSubscribedBefore();
      this.update({ state: 'subscribed', endpoint: subscription.endpoint });
      return subscription;
    } catch {
      this.update({ state: 'error', endpoint: null });
      return null;
    }
  }

  /** Cancela a assinatura no navegador (a desativação no servidor é feita
   * separadamente pelo hook, via rota autenticada). */
  async unsubscribeBrowser(): Promise<void> {
    clearSubscribedBeforeMarker();
    if (!browserSupportsWebPush()) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      await subscription?.unsubscribe();
    } finally {
      this.update({ state: 'permission_granted_no_subscription', endpoint: null });
    }
  }

  private update(next: PushSubscriptionSnapshot): void {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}

let instance: PushSubscriptionController | undefined;

export function getPushSubscriptionController(): PushSubscriptionController {
  if (!instance) {
    instance = new PushSubscriptionController();
  }
  return instance;
}

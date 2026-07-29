// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushSubscriptionController } from '@/platform/push/push-subscription.controller';

const VAPID_KEY = 'B'.repeat(87);
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function mockUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: ua });
}

function mockStandalone(standalone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query === '(display-mode: standalone)' && standalone,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

function mockNotification(permission: NotificationPermission, requestPermissionResult?: NotificationPermission) {
  (window as unknown as { Notification: unknown }).Notification = {
    permission,
    requestPermission: vi.fn(async () => requestPermissionResult ?? permission),
  };
}

function mockServiceWorkerSupport(opts: {
  existingSubscription?: { endpoint: string } | null;
  subscribeResult?: { endpoint: string } | Error;
}) {
  const getSubscription = vi.fn(async () => opts.existingSubscription ?? null);
  const subscribe = vi.fn(async () => {
    if (opts.subscribeResult instanceof Error) throw opts.subscribeResult;
    return opts.subscribeResult ?? { endpoint: 'https://push.example/sub-1' };
  });
  const registration = { pushManager: { getSubscription, subscribe } };

  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve(registration) },
  });
  (window as unknown as { PushManager: unknown }).PushManager = function () {};

  return { getSubscription, subscribe };
}

function clearWebPushGlobals() {
  delete (window as unknown as { Notification?: unknown }).Notification;
  delete (window as unknown as { PushManager?: unknown }).PushManager;
  Object.defineProperty(window.navigator, 'serviceWorker', { configurable: true, value: undefined });
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('PushSubscriptionController', () => {
  beforeEach(() => {
    mockUserAgent(ANDROID_UA);
    mockStandalone(false);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearWebPushGlobals();
  });

  it('navegador sem suporte (sem PushManager/Notification/serviceWorker)', async () => {
    clearWebPushGlobals();
    const controller = new PushSubscriptionController();
    controller.start(VAPID_KEY);
    await flushMicrotasks();
    expect(controller.getSnapshot().state).toBe('unsupported');
  });

  it('iPhone fora do modo instalado: bloqueia mesmo com o resto suportado', async () => {
    mockUserAgent(IPHONE_UA);
    mockStandalone(false);
    mockNotification('default');
    mockServiceWorkerSupport({});
    const controller = new PushSubscriptionController();
    controller.start(VAPID_KEY);
    await flushMicrotasks();
    expect(controller.getSnapshot().state).toBe('ios_not_installed');
  });

  it('chave VAPID pública ausente no servidor', async () => {
    mockNotification('default');
    mockServiceWorkerSupport({});
    const controller = new PushSubscriptionController();
    controller.start(undefined);
    await flushMicrotasks();
    expect(controller.getSnapshot().state).toBe('vapid_missing');
  });

  it('permissão ainda não solicitada (default)', async () => {
    mockNotification('default');
    mockServiceWorkerSupport({});
    const controller = new PushSubscriptionController();
    controller.start(VAPID_KEY);
    await flushMicrotasks();
    expect(controller.getSnapshot().state).toBe('permission_default');
  });

  it('permissão negada', async () => {
    mockNotification('denied');
    mockServiceWorkerSupport({});
    const controller = new PushSubscriptionController();
    controller.start(VAPID_KEY);
    await flushMicrotasks();
    expect(controller.getSnapshot().state).toBe('permission_denied');
  });

  it('permissão concedida sem assinatura existente', async () => {
    mockNotification('granted');
    mockServiceWorkerSupport({ existingSubscription: null });
    const controller = new PushSubscriptionController();
    controller.start(VAPID_KEY);
    await flushMicrotasks();
    expect(controller.getSnapshot().state).toBe('permission_granted_no_subscription');
  });

  it('assinatura ativa: reconcilia a partir de uma assinatura já existente', async () => {
    mockNotification('granted');
    mockServiceWorkerSupport({ existingSubscription: { endpoint: 'https://push.example/existing' } });
    const controller = new PushSubscriptionController();
    controller.start(VAPID_KEY);
    await flushMicrotasks();
    expect(controller.getSnapshot()).toEqual({ state: 'subscribed', endpoint: 'https://push.example/existing' });
  });

  it('assinatura perdida: já tinha assinado antes (marcador local) mas a assinatura sumiu', async () => {
    window.localStorage.setItem('ppl:push-subscribed-before', '1');
    mockNotification('granted');
    mockServiceWorkerSupport({ existingSubscription: null });
    const controller = new PushSubscriptionController();
    controller.start(VAPID_KEY);
    await flushMicrotasks();
    expect(controller.getSnapshot().state).toBe('subscription_lost');
  });

  it('requestPermissionAndSubscribe só é chamado explicitamente — nunca durante start()', async () => {
    mockNotification('default');
    const { subscribe } = mockServiceWorkerSupport({});
    const controller = new PushSubscriptionController();
    controller.start(VAPID_KEY);
    await flushMicrotasks();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('requestPermissionAndSubscribe: sucesso assina e atualiza o estado', async () => {
    const requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
    mockNotification('default');
    (window as unknown as { Notification: { permission: string; requestPermission: typeof requestPermission } }).Notification = {
      permission: 'default',
      requestPermission,
    };
    mockServiceWorkerSupport({ subscribeResult: { endpoint: 'https://push.example/new' } });
    const controller = new PushSubscriptionController();
    controller.start(VAPID_KEY);
    await flushMicrotasks();

    const result = await controller.requestPermissionAndSubscribe();
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(result?.endpoint).toBe('https://push.example/new');
    expect(controller.getSnapshot()).toEqual({ state: 'subscribed', endpoint: 'https://push.example/new' });
  });

  it('requestPermissionAndSubscribe: permissão negada no clique atualiza o estado e retorna null', async () => {
    const requestPermission = vi.fn(async () => 'denied' as NotificationPermission);
    (window as unknown as { Notification: { permission: string; requestPermission: typeof requestPermission } }).Notification = {
      permission: 'default',
      requestPermission,
    };
    mockServiceWorkerSupport({});
    const controller = new PushSubscriptionController();
    controller.start(VAPID_KEY);
    await flushMicrotasks();

    const result = await controller.requestPermissionAndSubscribe();
    expect(result).toBeNull();
    expect(controller.getSnapshot().state).toBe('permission_denied');
  });

  it('unsubscribeBrowser cancela a assinatura e limpa o marcador local', async () => {
    mockNotification('granted');
    const unsubscribe = vi.fn(async () => true);
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn(async () => ({ unsubscribe })),
          },
        }),
      },
    });
    (window as unknown as { PushManager: unknown }).PushManager = function () {};
    window.localStorage.setItem('ppl:push-subscribed-before', '1');

    const controller = new PushSubscriptionController();
    controller.start(VAPID_KEY);
    await flushMicrotasks();

    await controller.unsubscribeBrowser();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('ppl:push-subscribed-before')).toBeNull();
    expect(controller.getSnapshot().state).toBe('permission_granted_no_subscription');
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceWorkerController } from '@/platform/pwa/service-worker.controller';

type Listener = (...args: unknown[]) => void;

function createFakeWorker() {
  const listeners: Record<string, Listener[]> = {};
  return {
    state: 'installing',
    postMessage: vi.fn(),
    addEventListener: vi.fn((type: string, cb: Listener) => {
      (listeners[type] ??= []).push(cb);
    }),
    emit(type: string) {
      (listeners[type] ?? []).forEach((cb) => cb());
    },
  };
}

function createFakeRegistration() {
  const listeners: Record<string, Listener[]> = {};
  return {
    waiting: null as ReturnType<typeof createFakeWorker> | null,
    active: null as ReturnType<typeof createFakeWorker> | null,
    installing: null as ReturnType<typeof createFakeWorker> | null,
    addEventListener: vi.fn((type: string, cb: Listener) => {
      (listeners[type] ??= []).push(cb);
    }),
    emit(type: string) {
      (listeners[type] ?? []).forEach((cb) => cb());
    },
  };
}

function createFakeServiceWorkerContainer(registration: ReturnType<typeof createFakeRegistration>) {
  const listeners: Record<string, Listener[]> = {};
  return {
    controller: null as unknown,
    register: vi.fn(async () => registration),
    addEventListener: vi.fn((type: string, cb: Listener) => {
      (listeners[type] ??= []).push(cb);
    }),
    emit(type: string) {
      (listeners[type] ?? []).forEach((cb) => cb());
    },
  };
}

function installFakeServiceWorker(container: ReturnType<typeof createFakeServiceWorkerContainer>) {
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: container,
  });
}

function removeFakeServiceWorker() {
  // Precisa remover a própria propriedade — deixá-la como `undefined` ainda
  // faria `'serviceWorker' in navigator` retornar true.
  delete (window.navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

const reload = vi.fn();

beforeEach(() => {
  reload.mockClear();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  removeFakeServiceWorker();
});

describe('ServiceWorkerController', () => {
  it('não registra fora de produção (ambiente de dev não deve cachear um SW)', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const registration = createFakeRegistration();
    const container = createFakeServiceWorkerContainer(registration);
    installFakeServiceWorker(container);

    const controller = new ServiceWorkerController();
    controller.register();
    window.dispatchEvent(new Event('load'));
    await flush();

    expect(container.register).not.toHaveBeenCalled();
  });

  it('não registra quando o navegador não suporta service worker', () => {
    vi.stubEnv('NODE_ENV', 'production');
    removeFakeServiceWorker();

    const controller = new ServiceWorkerController();
    expect(() => controller.register()).not.toThrow();
    expect(controller.getSnapshot().updateAvailable).toBe(false);
  });

  it('registra em produção e detecta uma versão nova instalada', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const registration = createFakeRegistration();
    const container = createFakeServiceWorkerContainer(registration);
    container.controller = {}; // já existe um SW controlando a página (não é a 1ª instalação)
    installFakeServiceWorker(container);

    const controller = new ServiceWorkerController();
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.register();
    window.dispatchEvent(new Event('load'));
    await flush();

    expect(container.register).toHaveBeenCalledWith('/sw.js');

    // Uma atualização é encontrada.
    const installingWorker = createFakeWorker();
    registration.installing = installingWorker;
    registration.emit('updatefound');

    installingWorker.state = 'installed';
    installingWorker.emit('statechange');

    expect(controller.getSnapshot().updateAvailable).toBe(true);
    expect(listener).toHaveBeenCalled();
  });

  it('detecta uma atualização que já estava esperando no momento do registro', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const registration = createFakeRegistration();
    registration.active = createFakeWorker();
    registration.waiting = createFakeWorker();
    const container = createFakeServiceWorkerContainer(registration);
    installFakeServiceWorker(container);

    const controller = new ServiceWorkerController();
    controller.register();
    window.dispatchEvent(new Event('load'));
    await flush();

    expect(controller.getSnapshot().updateAvailable).toBe(true);
  });

  it('applyUpdate() manda a versão em espera assumir o controle', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const registration = createFakeRegistration();
    registration.active = createFakeWorker();
    const waitingWorker = createFakeWorker();
    registration.waiting = waitingWorker;
    const container = createFakeServiceWorkerContainer(registration);
    installFakeServiceWorker(container);

    const controller = new ServiceWorkerController();
    controller.register();
    window.dispatchEvent(new Event('load'));
    await flush();

    controller.applyUpdate();
    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('recarrega uma única vez quando o controller muda (evita loop de recarregamento)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const registration = createFakeRegistration();
    const container = createFakeServiceWorkerContainer(registration);
    installFakeServiceWorker(container);

    const controller = new ServiceWorkerController();
    controller.register();
    window.dispatchEvent(new Event('load'));
    await flush();

    container.emit('controllerchange');
    container.emit('controllerchange');

    expect(reload).toHaveBeenCalledTimes(1);
  });
});

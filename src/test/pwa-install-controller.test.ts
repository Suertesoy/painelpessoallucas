// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaInstallController } from '@/platform/pwa/pwa-install.controller';

function mockMatchMedia(standalone: boolean) {
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

function mockUserAgent(userAgent: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  });
}

const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const IPHONE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

class FakeBeforeInstallPromptEvent extends Event {
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  private resolveChoice!: (value: { outcome: 'accepted' | 'dismissed'; platform: string }) => void;

  constructor() {
    super('beforeinstallprompt', { cancelable: true });
    this.userChoice = new Promise((resolve) => {
      this.resolveChoice = resolve;
    });
  }

  prompt = vi.fn(async () => {});

  resolve(outcome: 'accepted' | 'dismissed') {
    this.resolveChoice({ outcome, platform: 'web' });
  }
}

describe('PwaInstallController', () => {
  beforeEach(() => {
    mockMatchMedia(false);
    mockUserAgent(ANDROID_CHROME_UA);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('começa como não instalável até o navegador disparar beforeinstallprompt', () => {
    const controller = new PwaInstallController();
    controller.start();

    expect(controller.getSnapshot()).toEqual({
      isStandalone: false,
      isIOS: false,
      canPromptInstall: false,
    });
    controller.stop();
  });

  it('detecta modo standalone (app já instalado) via matchMedia', () => {
    mockMatchMedia(true);
    const controller = new PwaInstallController();
    controller.start();

    expect(controller.getSnapshot().isStandalone).toBe(true);
    controller.stop();
  });

  it('detecta iOS (Safari/Chrome) para orientar instalação manual', () => {
    mockUserAgent(IPHONE_SAFARI_UA);
    const controller = new PwaInstallController();
    controller.start();

    expect(controller.getSnapshot().isIOS).toBe(true);
    expect(controller.getSnapshot().canPromptInstall).toBe(false);
    controller.stop();
  });

  it('captura beforeinstallprompt e habilita o prompt de instalação', () => {
    const controller = new PwaInstallController();
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.start();

    const event = new FakeBeforeInstallPromptEvent();
    const preventDefault = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);

    expect(preventDefault).toHaveBeenCalled();
    expect(controller.getSnapshot().canPromptInstall).toBe(true);
    expect(listener).toHaveBeenCalled();
    controller.stop();
  });

  it('promptInstall() só resolve depois da escolha do usuário e depois desativa o prompt', async () => {
    const controller = new PwaInstallController();
    controller.start();

    const event = new FakeBeforeInstallPromptEvent();
    window.dispatchEvent(event);
    expect(controller.getSnapshot().canPromptInstall).toBe(true);

    const resultPromise = controller.promptInstall();
    event.resolve('accepted');
    const result = await resultPromise;

    expect(result).toBe('accepted');
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().canPromptInstall).toBe(false);
    controller.stop();
  });

  it('promptInstall() sem evento capturado retorna "unavailable" sem lançar erro', async () => {
    const controller = new PwaInstallController();
    controller.start();

    await expect(controller.promptInstall()).resolves.toBe('unavailable');
    controller.stop();
  });

  it('marca standalone e desativa o prompt quando "appinstalled" dispara', () => {
    const controller = new PwaInstallController();
    controller.start();

    window.dispatchEvent(new FakeBeforeInstallPromptEvent());
    expect(controller.getSnapshot().canPromptInstall).toBe(true);

    window.dispatchEvent(new Event('appinstalled'));

    expect(controller.getSnapshot()).toMatchObject({
      isStandalone: true,
      canPromptInstall: false,
    });
    controller.stop();
  });
});

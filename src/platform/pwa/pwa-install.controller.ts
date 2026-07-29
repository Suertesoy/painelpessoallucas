'use client';

/**
 * Estado de instalabilidade da PWA, centralizado num único observável
 * (mesmo padrão de `ChangeNotifier`: subscribe + snapshot para
 * `useSyncExternalStore`). Nenhum componente deve ler `beforeinstallprompt`,
 * `matchMedia('(display-mode: standalone)')` ou o UA do iOS diretamente —
 * tudo passa por aqui, para manter a lógica testável num único lugar.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PwaInstallSnapshot {
  /** O painel já roda como app instalado (standalone/fullscreen). */
  isStandalone: boolean;
  /** iOS (Safari/Chrome) não dispara `beforeinstallprompt`; exige instrução manual. */
  isIOS: boolean;
  /** O navegador ofereceu o prompt de instalação nativo e ele ainda não foi usado. */
  canPromptInstall: boolean;
}

const UNSUPPORTED_SNAPSHOT: PwaInstallSnapshot = {
  isStandalone: false,
  isIOS: false,
  canPromptInstall: false,
};

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const navigatorStandalone = (window.navigator as Navigator & { standalone?: boolean })
    .standalone;
  return window.matchMedia('(display-mode: standalone)').matches || navigatorStandalone === true;
}

function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
}

export class PwaInstallController {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private listeners = new Set<() => void>();
  private snapshot: PwaInstallSnapshot = UNSUPPORTED_SNAPSHOT;
  private started = false;

  start(): void {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;

    this.updateSnapshot({
      isStandalone: detectStandalone(),
      isIOS: detectIOS(),
      canPromptInstall: false,
    });

    window.addEventListener('beforeinstallprompt', this.handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', this.handleAppInstalled);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    window.removeEventListener('beforeinstallprompt', this.handleBeforeInstallPrompt);
    window.removeEventListener('appinstalled', this.handleAppInstalled);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): PwaInstallSnapshot => this.snapshot;

  getServerSnapshot = (): PwaInstallSnapshot => UNSUPPORTED_SNAPSHOT;

  /** Só deve ser chamado a partir de uma ação explícita do usuário (clique). */
  promptInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!this.deferredPrompt) return 'unavailable';
    const prompt = this.deferredPrompt;
    this.deferredPrompt = null;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    this.updateSnapshot({ ...this.snapshot, canPromptInstall: false });
    return outcome;
  };

  private handleBeforeInstallPrompt = (event: Event): void => {
    event.preventDefault();
    this.deferredPrompt = event as BeforeInstallPromptEvent;
    this.updateSnapshot({ ...this.snapshot, canPromptInstall: true });
  };

  private handleAppInstalled = (): void => {
    this.deferredPrompt = null;
    this.updateSnapshot({ isStandalone: true, isIOS: this.snapshot.isIOS, canPromptInstall: false });
  };

  private updateSnapshot(next: PwaInstallSnapshot): void {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}

let instance: PwaInstallController | undefined;

export function getPwaInstallController(): PwaInstallController {
  if (!instance) {
    instance = new PwaInstallController();
  }
  return instance;
}

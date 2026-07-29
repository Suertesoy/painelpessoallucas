'use client';

/**
 * Registro e ciclo de atualização do service worker, centralizados aqui
 * (mesmo motivo do `PwaInstallController`: nenhum componente deve chamar
 * `navigator.serviceWorker` diretamente).
 *
 * Fluxo de atualização controlada:
 * 1. Uma nova versão do sw.js é instalada em segundo plano e fica
 *    "esperando" (nunca ativa sozinha — sem `skipWaiting` automático).
 * 2. `snapshot.updateAvailable` vira true; a UI mostra o aviso discreto.
 * 3. Só quando o usuário confirma ("Atualizar agora"), `applyUpdate()`
 *    manda a nova versão assumir o controle.
 * 4. `controllerchange` recarrega a página uma única vez (guarda contra
 *    loop de recarregamento).
 */
export interface ServiceWorkerSnapshot {
  updateAvailable: boolean;
}

const IDLE_SNAPSHOT: ServiceWorkerSnapshot = { updateAvailable: false };

export class ServiceWorkerController {
  private registration: ServiceWorkerRegistration | null = null;
  private waitingWorker: ServiceWorker | null = null;
  private listeners = new Set<() => void>();
  private snapshot: ServiceWorkerSnapshot = IDLE_SNAPSHOT;
  private reloading = false;
  private started = false;

  /** Só registra em produção: em dev, um SW cacheado atrapalharia o hot reload. */
  register(): void {
    if (this.started) return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    this.started = true;

    navigator.serviceWorker.addEventListener('controllerchange', this.handleControllerChange);

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          this.registration = registration;

          if (registration.waiting && registration.active) {
            this.setWaiting(registration.waiting);
          }

          registration.addEventListener('updatefound', () => {
            const installing = registration.installing;
            if (!installing) return;

            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                this.setWaiting(installing);
              }
            });
          });
        })
        .catch(() => {
          // Registro é best-effort: falha aqui nunca deve quebrar o app.
        });
    });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ServiceWorkerSnapshot => this.snapshot;

  getServerSnapshot = (): ServiceWorkerSnapshot => IDLE_SNAPSHOT;

  /** Só deve ser chamado a partir da confirmação explícita do usuário. */
  applyUpdate = (): void => {
    this.waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
  };

  private handleControllerChange = (): void => {
    if (this.reloading) return;
    this.reloading = true;
    window.location.reload();
  };

  private setWaiting(worker: ServiceWorker): void {
    this.waitingWorker = worker;
    this.snapshot = { updateAvailable: true };
    this.listeners.forEach((listener) => listener());
  }
}

let instance: ServiceWorkerController | undefined;

export function getServiceWorkerController(): ServiceWorkerController {
  if (!instance) {
    instance = new ServiceWorkerController();
  }
  return instance;
}

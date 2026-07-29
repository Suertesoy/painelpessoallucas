'use client';

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export type RealtimeSyncStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline';

/**
 * Notificador de mudanças compartilhado pelos repositórios Supabase.
 *
 * Mantém o contrato observável dos repositórios (subscribe/notify) da Fase 1:
 * - Mutações locais chamam notify() → queries reativas reexecutam.
 * - Postgres Changes dispara notify() quando outro dispositivo altera dados.
 * - Foco, visibilidade e reconexão disparam uma reconciliação completa para
 *   recuperar qualquer evento perdido enquanto a aba esteve suspensa.
 */
export class ChangeNotifier {
  private listeners = new Set<() => void>();
  private statusListeners = new Set<() => void>();
  private realtimeChannel: RealtimeChannel | null = null;
  private status: RealtimeSyncStatus = 'connecting';
  private started = false;
  private stopping = false;

  constructor(
    private supabase?: SupabaseClient,
    private workspaceId?: string
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeStatus = (listener: () => void): (() => void) => {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  };

  getStatus = (): RealtimeSyncStatus => this.status;

  notify(): void {
    this.listeners.forEach((l) => l());
  }

  startRealtime(): void {
    if (
      this.started ||
      !this.supabase ||
      !this.workspaceId ||
      typeof window === 'undefined'
    ) {
      return;
    }

    this.started = true;
    this.stopping = false;
    this.setStatus(navigator.onLine ? 'connecting' : 'offline');
    this.bindWindowEvents();

    const channel = this.supabase
      .channel(`painel-realtime-${this.workspaceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        () => this.notify()
      )
      .subscribe((channelStatus) => {
        if (this.stopping) return;

        if (channelStatus === 'SUBSCRIBED') {
          this.setStatus('connected');
          // A inscrição também é uma barreira de reconciliação: a consulta
          // completa recupera mudanças ocorridas antes do canal ficar pronto.
          this.notify();
          return;
        }

        if (
          channelStatus === 'CHANNEL_ERROR' ||
          channelStatus === 'TIMED_OUT' ||
          channelStatus === 'CLOSED'
        ) {
          this.setStatus(navigator.onLine ? 'reconnecting' : 'offline');
        }
      });

    this.realtimeChannel = channel;
  }

  dispose(): void {
    if (!this.started) return;
    this.stopping = true;
    this.started = false;
    this.unbindWindowEvents();
    if (this.realtimeChannel && this.supabase) {
      void this.supabase.removeChannel(this.realtimeChannel);
    }
    this.realtimeChannel = null;
  }

  private setStatus(next: RealtimeSyncStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.statusListeners.forEach((listener) => listener());
  }

  private handleFocus = () => {
    this.notify();
  };

  private handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      this.notify();
    }
  };

  private handleOnline = () => {
    this.setStatus('reconnecting');
    this.notify();
    this.supabase?.realtime.connect();
  };

  private handleOffline = () => {
    this.setStatus('offline');
  };

  private bindWindowEvents(): void {
    window.addEventListener('focus', this.handleFocus);
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  private unbindWindowEvents(): void {
    window.removeEventListener('focus', this.handleFocus);
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    document.removeEventListener('visibilitychange', this.handleVisibility);
  }
}

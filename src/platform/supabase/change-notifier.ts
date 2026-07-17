'use client';

/**
 * Notificador de mudanças compartilhado pelos repositórios Supabase.
 *
 * Mantém o contrato observável dos repositórios (subscribe/notify) da Fase 1:
 * - Mutações locais chamam notify() → queries reativas reexecutam.
 * - Foco/visibilidade da aba disparam refetch (dados podem ter mudado em
 *   outro dispositivo). Sem realtime nesta fase (decisão do ROADMAP).
 */
export class ChangeNotifier {
  private listeners = new Set<() => void>();
  private windowBound = false;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    this.bindWindowEvents();
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify(): void {
    this.listeners.forEach((l) => l());
  }

  private bindWindowEvents() {
    if (this.windowBound || typeof window === 'undefined') return;
    this.windowBound = true;
    window.addEventListener('focus', () => this.notify());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.notify();
    });
  }
}

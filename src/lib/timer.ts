/**
 * Fundamentos de cronômetro compartilhados por Estudos (tempo estudado) e
 * Treinos (contagem regressiva de descanso).
 *
 * Regra: o tempo é SEMPRE derivado de timestamps persistidos, nunca de um
 * contador em memória. Assim a contagem sobrevive a navegação, recarregamento,
 * aba suspensa e retorno ao aplicativo — e os mesmos timestamps podem ser
 * reutilizados no futuro por uma Live Activity (ActivityKit), que também
 * trabalha com datas de início/fim e não com ticks.
 */

/** Cronômetro progressivo com pausas (sessão de estudo). */
export interface StopwatchState {
  startedAt: string;
  /** Preenchido enquanto a sessão está PAUSADA (instante em que pausou). */
  pausedAt?: string | null;
  /** Soma dos períodos de pausa já encerrados (não inclui a pausa em curso). */
  pausedTotalSeconds: number;
  /** Instante de encerramento, quando a sessão terminou. */
  endedAt?: string | null;
}

function ms(iso: string): number {
  return new Date(iso).getTime();
}

/**
 * Segundos efetivamente trabalhados: tempo corrido menos todas as pausas.
 * Durante uma pausa em curso o relógio fica congelado em `pausedAt`.
 */
export function elapsedSeconds(state: StopwatchState, nowMs: number): number {
  const endMs = state.endedAt ? ms(state.endedAt) : state.pausedAt ? ms(state.pausedAt) : nowMs;
  const total = (endMs - ms(state.startedAt)) / 1000 - state.pausedTotalSeconds;
  return Math.max(0, Math.floor(total));
}

/** Retoma: acrescenta a pausa em curso ao total e limpa `pausedAt`. */
export function pausedSecondsSoFar(state: { pausedAt?: string | null; pausedTotalSeconds?: number }, nowMs: number): number {
  const total = state.pausedTotalSeconds ?? 0;
  if (!state.pausedAt) return total;
  return total + Math.max(0, Math.round((nowMs - ms(state.pausedAt)) / 1000));
}

/** Contagem regressiva (descanso entre séries). */
export interface CountdownState {
  /** Instante previsto de término (ISO). Nulo quando não há descanso ativo. */
  endsAt?: string | null;
  /** Segundos restantes congelados enquanto o descanso está pausado. */
  pausedRemainingSeconds?: number | null;
}

/** Segundos restantes (arredondados para cima). Negativo nunca: 0 = terminou. */
export function remainingSeconds(state: CountdownState, nowMs: number): number {
  if (state.pausedRemainingSeconds != null) return Math.max(0, state.pausedRemainingSeconds);
  if (!state.endsAt) return 0;
  return Math.max(0, Math.ceil((ms(state.endsAt) - nowMs) / 1000));
}

export type CountdownPhase = 'idle' | 'running' | 'paused' | 'finished';

export function countdownPhase(state: CountdownState, nowMs: number): CountdownPhase {
  if (state.pausedRemainingSeconds != null) return 'paused';
  if (!state.endsAt) return 'idle';
  return ms(state.endsAt) > nowMs ? 'running' : 'finished';
}

/** "mm:ss" (ou "h:mm:ss" a partir de 1 hora). */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Minutos para exibição (ex.: "12 min"); abaixo de 1 min mostra segundos. */
export function formatDurationShort(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  if (safe < 60) return `${safe} s`;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
  }
  return seconds >= 30 ? `${minutes + 1} min` : `${minutes} min`;
}

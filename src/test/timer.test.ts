import { describe, it, expect } from 'vitest';
import { countdownPhase, elapsedSeconds, formatClock, formatDurationShort, pausedSecondsSoFar, remainingSeconds } from '@/lib/timer';

const T0 = Date.parse('2026-10-15T12:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();

describe('cronômetro progressivo (timestamps)', () => {
  it('conta o tempo corrido desde o início', () => {
    expect(elapsedSeconds({ startedAt: at(0), pausedTotalSeconds: 0 }, T0 + 125_000)).toBe(125);
  });

  it('não conta períodos pausados', () => {
    // 10 min rodando, pausa de 5 min já encerrada, mais 2 min rodando
    expect(elapsedSeconds({ startedAt: at(0), pausedTotalSeconds: 300 }, T0 + 17 * 60_000)).toBe(12 * 60);
  });

  it('congela em pausedAt enquanto pausado, mesmo que o relógio avance', () => {
    const state = { startedAt: at(0), pausedAt: at(600), pausedTotalSeconds: 0 };
    expect(elapsedSeconds(state, T0 + 600_000)).toBe(600);
    expect(elapsedSeconds(state, T0 + 9_000_000)).toBe(600);
  });

  it('sessão encerrada usa endedAt', () => {
    expect(elapsedSeconds({ startedAt: at(0), endedAt: at(90), pausedTotalSeconds: 30 }, T0 + 99_999_000)).toBe(60);
  });

  it('nunca negativo (relógio do aparelho atrasado)', () => {
    expect(elapsedSeconds({ startedAt: at(100), pausedTotalSeconds: 0 }, T0)).toBe(0);
  });

  it('acumula a pausa em curso ao retomar', () => {
    expect(pausedSecondsSoFar({ pausedAt: at(100), pausedTotalSeconds: 20 }, T0 + 160_000)).toBe(80);
    expect(pausedSecondsSoFar({ pausedTotalSeconds: 20 }, T0)).toBe(20);
    expect(pausedSecondsSoFar({}, T0)).toBe(0);
  });
});

describe('contagem regressiva', () => {
  it('calcula restantes a partir do término e arredonda para cima', () => {
    expect(remainingSeconds({ endsAt: at(90) }, T0 + 30_500)).toBe(60);
  });

  it('fases: idle, running, paused, finished', () => {
    expect(countdownPhase({}, T0)).toBe('idle');
    expect(countdownPhase({ endsAt: at(10) }, T0)).toBe('running');
    expect(countdownPhase({ endsAt: at(10) }, T0 + 10_000)).toBe('finished');
    expect(countdownPhase({ pausedRemainingSeconds: 40 }, T0)).toBe('paused');
  });

  it('pausado mantém o restante congelado', () => {
    expect(remainingSeconds({ pausedRemainingSeconds: 40, endsAt: at(1) }, T0 + 99_000_000)).toBe(40);
  });

  it('terminado retorna 0 (nunca negativo) — sobrevive a reabrir o app depois do prazo', () => {
    expect(remainingSeconds({ endsAt: at(10) }, T0 + 3_600_000)).toBe(0);
  });
});

describe('formatação', () => {
  it('mm:ss e h:mm:ss', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(75)).toBe('01:15');
    expect(formatClock(3725)).toBe('1:02:05');
  });
  it('duração curta', () => {
    expect(formatDurationShort(45)).toBe('45 s');
    expect(formatDurationShort(12 * 60 + 10)).toBe('12 min');
    expect(formatDurationShort(3600 + 20 * 60)).toBe('1 h 20 min');
  });
});

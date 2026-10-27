// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import type { WorkoutSession } from '@/modules/workouts/domain/workout.schema';

const ensureRestAlert = vi.fn();
// Igual ao provider real (useMemo): a mesma instância de commands entre renders.
const commands = { workout: { ensureRestAlert } };
vi.mock('@/providers/repository.provider', () => ({
  useCommands: () => commands,
}));
vi.mock('@/lib/beep', () => ({ playBeep: vi.fn() }));

import { RestTimerBar } from '@/components/workouts/rest-timer-bar';

/**
 * Navegar/recarregar durante o descanso: o agendamento já persistido no
 * QStash continua valendo sem o navegador. Ao abrir a tela de novo (ou voltar
 * ao app) com o descanso correndo, a barra só re-garante o agendamento —
 * idempotente no servidor — para cobrir um pedido que tenha se perdido.
 */

const NOW = Date.parse('2026-10-26T15:00:00.000Z');

function session(over: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: '5a3c6f1e-7d8b-4c9e-8f0a-1b2c3d4e5f6a',
    workspaceId: '0b8f1a52-6d1e-4c1a-9a51-2a8e3c7b9d01',
    athleteId: '3e1a4d9c-5b6f-4a7c-8d8e-9f0a1b2c3d4e',
    dayId: '4f2b5e0d-6c7a-4b8d-9e9f-0a1b2c3d4e5f',
    sessionDate: '2026-10-26',
    startedAt: new Date(NOW - 600_000).toISOString(),
    status: 'in_progress',
    restEndsAt: new Date(NOW + 60_000).toISOString(),
    restDurationSeconds: 90,
    createdAt: new Date(NOW - 600_000).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    ...over,
  };
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  setVisibility('visible');
  ensureRestAlert.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('RestTimerBar — recuperação do aviso push', () => {
  it('abrir/recarregar a tela com descanso correndo re-garante o agendamento uma vez', () => {
    render(<RestTimerBar session={session()} onError={() => undefined} />);
    expect(ensureRestAlert).toHaveBeenCalledTimes(1);
    expect(ensureRestAlert).toHaveBeenCalledWith('5a3c6f1e-7d8b-4c9e-8f0a-1b2c3d4e5f6a');
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(ensureRestAlert).toHaveBeenCalledTimes(1);
  });

  it('voltar ao app (tela visível de novo) com descanso correndo re-garante', () => {
    render(<RestTimerBar session={session()} onError={() => undefined} />);
    ensureRestAlert.mockClear();
    act(() => setVisibility('hidden'));
    expect(ensureRestAlert).not.toHaveBeenCalled();
    act(() => setVisibility('visible'));
    expect(ensureRestAlert).toHaveBeenCalledTimes(1);
  });

  it('descanso pausado, terminado ou inexistente: não agenda nada', () => {
    const cases = [
      session({ restEndsAt: undefined, restPausedRemainingSeconds: 30 }),
      session({ restEndsAt: new Date(NOW - 1000).toISOString() }),
      session({ restEndsAt: undefined, restDurationSeconds: undefined }),
    ];
    for (const s of cases) {
      render(<RestTimerBar session={s} onError={() => undefined} />);
      act(() => setVisibility('visible'));
      cleanup();
    }
    expect(ensureRestAlert).not.toHaveBeenCalled();
  });
});

'use client';

import { useEffect, useRef, useState } from 'react';
import { BellRing, Minus, Pause, Play, Plus, RotateCcw, X } from 'lucide-react';
import { useNow } from '@/lib/hooks';
import { useCommands } from '@/providers/repository.provider';
import { countdownPhase, formatClock, remainingSeconds } from '@/lib/timer';
import { playBeep } from '@/lib/beep';
import { restCountdownOf, type WorkoutSession } from '@/modules/workouts/domain/workout.schema';

/**
 * Contagem regressiva do descanso. O prazo (`restEndsAt`) vive na sessão,
 * então recarregar, navegar para a Home ou voltar ao app mostra o tempo
 * correto. Ao terminar: aviso visual + bipe (+ vibração onde existir).
 * Limite honesto do PWA no iPhone: com a tela bloqueada ou o app em segundo
 * plano o JavaScript é suspenso — o aviso aparece quando você volta ao app.
 */
export function RestTimerBar({ session, onError }: { session: WorkoutSession; onError: (message: string) => void }) {
  const { workout } = useCommands();
  const now = useNow(250);
  const alerted = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);

  const state = restCountdownOf(session);
  const phase = countdownPhase(state, now.getTime());
  const remaining = remainingSeconds(state, now.getTime());
  const total = session.restDurationSeconds ?? 0;

  // Aviso único por descanso (identificado pelo instante de término).
  useEffect(() => {
    if (phase !== 'finished' || !session.restEndsAt || alerted.current === session.restEndsAt) return;
    alerted.current = session.restEndsAt;
    playBeep();
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('Descanso terminou', { body: 'Hora da próxima série.' });
      } catch {
        /* notificação local indisponível */
      }
    }
  }, [phase, session.restEndsAt]);

  if (phase === 'idle') return null;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Não foi possível atualizar o descanso.');
    } finally {
      setBusy(false);
    }
  };

  const pct = total > 0 ? Math.min(100, Math.round(((total - remaining) / total) * 100)) : 100;
  const finished = phase === 'finished';
  const small =
    'flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 disabled:opacity-50';

  return (
    <div
      role="timer"
      aria-label={finished ? 'Descanso terminou' : `Descanso: ${formatClock(remaining)}`}
      className={`fixed inset-x-0 bottom-0 z-30 border-t px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_30px_-12px_rgba(0,0,0,0.6)] ${
        finished ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-gray-500">{finished ? 'Descanso terminou' : phase === 'paused' ? 'Descanso pausado' : 'Descansando'}</p>
            <p className={`tabular text-4xl font-bold ${finished ? 'text-emerald-700' : 'text-gray-900'}`}>
              {finished ? (
                <span className="flex items-center gap-2">
                  <BellRing size={28} className="animate-pulse motion-reduce:animate-none" aria-hidden="true" /> Pronto!
                </span>
              ) : (
                formatClock(remaining)
              )}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {!finished && (
              <>
                <button type="button" disabled={busy} className={small} aria-label="Menos 15 segundos" onClick={() => void act(() => workout.adjustRest(session.id, -15))}>
                  <Minus size={14} /> 15s
                </button>
                <button type="button" disabled={busy} className={small} aria-label="Mais 15 segundos" onClick={() => void act(() => workout.adjustRest(session.id, 15))}>
                  <Plus size={14} /> 15s
                </button>
                {phase === 'paused' ? (
                  <button type="button" disabled={busy} className={small} aria-label="Retomar descanso" onClick={() => void act(() => workout.resumeRest(session.id))}>
                    <Play size={16} />
                  </button>
                ) : (
                  <button type="button" disabled={busy} className={small} aria-label="Pausar descanso" onClick={() => void act(() => workout.pauseRest(session.id))}>
                    <Pause size={16} />
                  </button>
                )}
              </>
            )}
            <button type="button" disabled={busy} className={small} aria-label="Reiniciar descanso" onClick={() => void act(() => workout.restartRest(session.id))}>
              <RotateCcw size={16} />
            </button>
            <button type="button" disabled={busy} className={small} aria-label={finished ? 'Fechar aviso' : 'Pular descanso'} onClick={() => void act(() => workout.clearRest(session.id))}>
              <X size={16} />
            </button>
          </div>
        </div>
        {!finished && (
          <div className="mt-2 h-1.5 rounded-full bg-gray-100" aria-hidden="true">
            <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Play, Pause, Square, XCircle } from 'lucide-react';
import { useNow } from '@/lib/hooks';
import { useCommands } from '@/providers/repository.provider';
import { elapsedSeconds, formatClock } from '@/lib/timer';
import {
  isStudySessionPaused,
  studySessionStopwatch,
  type Course,
  type StudySession,
} from '@/modules/learning/domain/learning.schema';
import { DailyGoalProgress } from '@/components/learning/daily-goal-progress';

/**
 * Sessão de estudo com cronômetro real: iniciar, pausar, retomar e encerrar.
 * O tempo vem dos timestamps gravados (início, pausa, pausas acumuladas) —
 * fechar o app, recarregar ou navegar para a Home não altera a contagem, e
 * o período pausado nunca entra no tempo estudado.
 */
export function StudySessionCard({
  course,
  goalMinutes,
  activeSession,
  completedSeconds = 0,
  onChanged,
}: {
  course: Course;
  /** Meta diária VIGENTE (preferência geral). */
  goalMinutes: number;
  activeSession: StudySession | null;
  /** Segundos já estudados hoje em sessões concluídas. */
  completedSeconds?: number;
  onChanged: () => void;
}) {
  const { learning: learningCmds } = useCommands();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useNow(1000);

  const isThisCourseActive = activeSession?.courseId === course.id;
  const paused = !!activeSession && isStudySessionPaused(activeSession);
  const sessionSeconds = activeSession ? elapsedSeconds(studySessionStopwatch(activeSession), now.getTime()) : 0;
  const todaySeconds = completedSeconds + sessionSeconds;
  const todayMinutes = Math.floor(todaySeconds / 60);

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  const btn =
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold disabled:opacity-60';

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 md:p-6">
      <DailyGoalProgress
        minutesStudied={todayMinutes}
        goalMinutes={goalMinutes}
        goalMet={todayMinutes >= goalMinutes}
      />

      <div className="mt-6 text-center" aria-live="off">
        <p className="text-sm text-gray-500">
          {isThisCourseActive ? (paused ? 'Sessão pausada' : 'Estudando agora') : course.title}
        </p>
        <p
          className="tabular mt-1 text-6xl font-bold tracking-tight text-gray-900"
          role="timer"
          aria-label={`Tempo desta sessão: ${formatClock(sessionSeconds)}`}
        >
          {formatClock(isThisCourseActive ? sessionSeconds : 0)}
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-center text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        {isThisCourseActive && activeSession ? (
          <>
            {paused ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => learningCmds.resumeStudySession(activeSession.id), 'Não foi possível retomar.')}
                className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}
              >
                <Play size={18} /> Retomar
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => learningCmds.pauseStudySession(activeSession.id), 'Não foi possível pausar.')}
                className={`${btn} border border-gray-300 bg-white text-gray-800 hover:bg-gray-50`}
              >
                <Pause size={18} /> Pausar
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => learningCmds.finishStudySession(activeSession.id), 'Não foi possível encerrar.')}
              className={`${btn} border border-gray-300 bg-white text-gray-800 hover:bg-gray-50`}
            >
              <Square size={18} /> Encerrar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => learningCmds.cancelStudySession(activeSession.id), 'Não foi possível descartar.')}
              className="inline-flex min-h-12 items-center gap-1.5 px-3 text-sm text-gray-500 hover:text-gray-800"
            >
              <XCircle size={16} /> Descartar
            </button>
          </>
        ) : activeSession ? (
          <p className="text-center text-sm text-gray-500">
            Há uma sessão em andamento em outro curso. Encerre ou descarte antes de iniciar esta.
          </p>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => learningCmds.startStudySession(course.workspaceId, course.id), 'Não foi possível iniciar a sessão.')}
            className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}
          >
            <Play size={18} /> Iniciar sessão
          </button>
        )}
      </div>
      {isThisCourseActive && (
        <p className="mt-3 text-center text-xs text-gray-400">
          O tempo continua contando mesmo se você sair desta tela. Pausas não entram no total.
        </p>
      )}
    </div>
  );
}

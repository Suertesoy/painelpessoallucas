'use client';

import Link from 'next/link';
import { Dumbbell, GraduationCap } from 'lucide-react';
import { useReactiveQuery, useNow } from '@/lib/hooks';
import { useQueries } from '@/providers/repository.provider';
import { elapsedSeconds, formatClock, remainingSeconds } from '@/lib/timer';
import { isStudySessionPaused, studySessionStopwatch } from '@/modules/learning/domain/learning.schema';
import { restCountdownOf } from '@/modules/workouts/domain/workout.schema';

/**
 * Atalho discreto para um cronômetro em andamento (estudo ou treino).
 * Navegar entre ambientes nunca encerra o cronômetro — ele vive no banco,
 * com timestamps; este atalho só mostra o estado e leva de volta.
 */
export function ActiveTimerChips() {
  const { learning, workout } = useQueries();
  const { data: study } = useReactiveQuery(() => learning.getActiveStudySession(), []);
  const { data: training } = useReactiveQuery(() => workout.findAnyActiveSession(), []);
  const now = useNow(1000);

  const chips: React.ReactNode[] = [];
  if (study) {
    const paused = isStudySessionPaused(study);
    chips.push(
      <Link
        key="study"
        href="/aprendizado"
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 text-xs font-medium"
        aria-label={`Estudo em andamento${paused ? ' (pausado)' : ''}`}
      >
        <GraduationCap size={14} aria-hidden="true" />
        <span className="tabular">{formatClock(elapsedSeconds(studySessionStopwatch(study), now.getTime()))}</span>
        {paused && <span className="text-[var(--text-muted)]">pausado</span>}
      </Link>
    );
  }
  if (training) {
    const rest = remainingSeconds(restCountdownOf(training), now.getTime());
    chips.push(
      <Link
        key="training"
        href={`/treinos/${training.athleteId}/sessao/${training.id}`}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 text-xs font-medium"
        aria-label="Treino em andamento"
      >
        <Dumbbell size={14} aria-hidden="true" />
        {rest > 0 ? <span className="tabular">descanso {formatClock(rest)}</span> : <span>Treino</span>}
      </Link>
    );
  }
  if (chips.length === 0) return null;
  return <div className="flex items-center gap-2">{chips}</div>;
}

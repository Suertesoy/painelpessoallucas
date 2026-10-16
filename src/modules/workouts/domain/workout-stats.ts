import type { BodyWeightLog, SetLog, WorkoutSession } from './workout.schema';

/** Ponto do gráfico de um exercício: um treino concluído/em andamento. */
export interface ExercisePoint {
  sessionId: string;
  date: string;
  /** Maior carga usada na sessão (kg); ausente se nenhuma série teve carga. */
  topLoadKg?: number;
  /** Repetições na série de maior carga (ou a melhor, sem carga). */
  repsAtTop: number;
  totalReps: number;
  sets: number;
}

/** Séries por sessão, ignorando sessões canceladas. Mais antigo → mais recente. */
export function buildExerciseSeries(
  logs: SetLog[],
  sessions: Pick<WorkoutSession, 'id' | 'sessionDate' | 'status'>[],
  exerciseId: string
): ExercisePoint[] {
  const sessionById = new Map(sessions.filter((s) => s.status !== 'cancelled').map((s) => [s.id, s]));
  const grouped = new Map<string, SetLog[]>();
  for (const log of logs) {
    if (log.exerciseId !== exerciseId || !sessionById.has(log.sessionId)) continue;
    const list = grouped.get(log.sessionId) ?? [];
    list.push(log);
    grouped.set(log.sessionId, list);
  }

  const points: ExercisePoint[] = [];
  for (const [sessionId, sets] of grouped) {
    const withLoad = sets.filter((s) => s.loadKg != null);
    const top = withLoad.length > 0 ? withLoad.reduce((a, b) => ((b.loadKg ?? 0) > (a.loadKg ?? 0) ? b : a)) : undefined;
    const best = top ?? sets.reduce((a, b) => (b.reps > a.reps ? b : a));
    points.push({
      sessionId,
      date: sessionById.get(sessionId)!.sessionDate,
      topLoadKg: top?.loadKg,
      repsAtTop: best.reps,
      totalReps: sets.reduce((sum, s) => sum + s.reps, 0),
      sets: sets.length,
    });
  }
  return points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sessionId.localeCompare(b.sessionId)));
}

/** Séries da sessão mais recente DIFERENTE da atual que teve o exercício. */
export function previousPerformance(
  logs: SetLog[],
  sessions: Pick<WorkoutSession, 'id' | 'sessionDate' | 'status' | 'startedAt'>[],
  exerciseId: string,
  currentSessionId: string
): { date: string; sets: SetLog[] } | null {
  const candidates = sessions
    .filter((s) => s.id !== currentSessionId && s.status !== 'cancelled')
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  for (const session of candidates) {
    const sets = logs
      .filter((l) => l.sessionId === session.id && l.exerciseId === exerciseId)
      .sort((a, b) => a.setNumber - b.setNumber);
    if (sets.length > 0) return { date: session.sessionDate, sets };
  }
  return null;
}

export interface BodyWeightSummary {
  latest?: BodyWeightLog;
  first?: BodyWeightLog;
  /** latest − first, em kg (1 casa decimal). */
  deltaKg?: number;
}

export function summarizeBodyWeight(logs: BodyWeightLog[]): BodyWeightSummary {
  if (logs.length === 0) return {};
  const sorted = [...logs].sort((a, b) => (a.loggedOn < b.loggedOn ? -1 : 1));
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];
  return {
    first,
    latest,
    deltaKg: sorted.length > 1 ? Math.round((latest.weightKg - first.weightKg) * 10) / 10 : undefined,
  };
}

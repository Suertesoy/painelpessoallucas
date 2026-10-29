import type { DayCompletion, SetLog, WorkoutDay, WorkoutExercise, WorkoutSession } from './workout.schema';

/**
 * Histórico de treinos — funções puras sobre registros persistidos.
 * Nada é estimado: série só existe se foi registrada, e a duração é o intervalo
 * real entre início e encerramento da SESSÃO (que pode passar por várias fichas,
 * por isso nunca é atribuída a uma ficha individual).
 */

/** Sessões acima disso recebem o aviso de "duração atípica" (nada é cortado nem corrigido). */
export const ATYPICAL_DURATION_SECONDS = 4 * 60 * 60;

export interface HistorySet {
  setNumber: number;
  loadKg?: number;
  reps: number;
  completedAt: string;
}

export interface HistoryExercise {
  exerciseId: string;
  name: string;
  dayCode: string;
  sets: HistorySet[];
}

export interface HistoryEntry {
  session: WorkoutSession;
  /** Duração total da sessão; null enquanto em andamento. */
  durationSeconds: number | null;
  atypicalDuration: boolean;
  totalSets: number;
  /** Exercícios DISTINTOS com ao menos uma série. */
  exerciseCount: number;
  /** Fichas (A–E) a que pertencem os exercícios executados, em ordem; vazio se não houve séries. */
  dayCodes: string[];
  /** Fichas concluídas explicitamente nesta sessão. */
  completedDayCodes: string[];
  exercises: HistoryExercise[];
}

export function sessionDurationSeconds(session: Pick<WorkoutSession, 'startedAt' | 'endedAt'>): number | null {
  if (!session.endedAt) return null;
  const ms = Date.parse(session.endedAt) - Date.parse(session.startedAt);
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 1000) : null;
}

export function buildHistory(input: {
  sessions: readonly WorkoutSession[];
  logs: readonly SetLog[];
  exercises: readonly Pick<WorkoutExercise, 'id' | 'name' | 'dayId' | 'position'>[];
  days: readonly Pick<WorkoutDay, 'id' | 'code' | 'position'>[];
  completions: readonly Pick<DayCompletion, 'sessionId' | 'dayId'>[];
  /** Isola o atleta: séries/conclusões de outra pessoa nunca entram. */
  athleteId: string;
}): HistoryEntry[] {
  const exById = new Map(input.exercises.map((e) => [e.id, e]));
  const dayById = new Map(input.days.map((d) => [d.id, d]));
  const dayOrder = (code: string) => input.days.find((d) => d.code === code)?.position ?? 0;

  return input.sessions
    .filter((s) => s.athleteId === input.athleteId)
    .slice()
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .map((session) => {
      const logs = input.logs.filter((l) => l.sessionId === session.id && l.athleteId === input.athleteId);
      const byExercise = new Map<string, SetLog[]>();
      for (const l of logs) byExercise.set(l.exerciseId, [...(byExercise.get(l.exerciseId) ?? []), l]);

      const exercises: HistoryExercise[] = [...byExercise.entries()]
        .flatMap(([exerciseId, list]) => {
          const ex = exById.get(exerciseId);
          const day = ex ? dayById.get(ex.dayId) : undefined;
          if (!ex || !day) return [];
          return [{
            exerciseId,
            name: ex.name,
            dayCode: day.code,
            position: ex.position,
            sets: list
              .slice()
              .sort((a, b) => a.setNumber - b.setNumber)
              .map((l) => ({ setNumber: l.setNumber, loadKg: l.loadKg, reps: l.reps, completedAt: l.completedAt })),
          }];
        })
        .sort((a, b) => dayOrder(a.dayCode) - dayOrder(b.dayCode) || a.position - b.position)
        .map((e) => ({ exerciseId: e.exerciseId, name: e.name, dayCode: e.dayCode, sets: e.sets }));

      const dayCodes = [...new Set(exercises.map((e) => e.dayCode))];
      const completedDayCodes = [
        ...new Set(
          input.completions
            .filter((c) => c.sessionId === session.id)
            .map((c) => dayById.get(c.dayId)?.code)
            .filter((c): c is string => !!c)
        ),
      ].sort((a, b) => dayOrder(a) - dayOrder(b));
      const durationSeconds = sessionDurationSeconds(session);
      return {
        session,
        durationSeconds,
        atypicalDuration: durationSeconds !== null && durationSeconds > ATYPICAL_DURATION_SECONDS,
        totalSets: logs.length,
        exerciseCount: byExercise.size,
        dayCodes,
        completedDayCodes,
        exercises,
      };
    });
}

/** 3900 → "1h05"; 3540 → "59 min"; 40 → "<1 min". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return '<1 min';
  const totalMin = Math.round(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h === 0 ? `${m} min` : `${h}h${String(m).padStart(2, '0')}`;
}

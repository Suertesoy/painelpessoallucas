import type { SetLog, WorkoutExercise, WorkoutSession } from './workout.schema';

/**
 * Progresso de exercícios e contagem de treinos concluídos — funções puras.
 *
 * Tudo sai dos REGISTROS persistidos (séries e sessões), nunca de um contador
 * visual ou de uma segunda fonte de verdade: desfazer uma série atualiza o
 * progresso na hora, e a contagem de treinos concluídos se recalcula sempre
 * do histórico.
 */

export type ExerciseProgressState = 'not_started' | 'in_progress' | 'done';

export interface ExerciseProgress {
  /** Séries registradas nesta sessão (distintas por número). */
  done: number;
  /** Séries prescritas (ou mais, se houve série extra registrada). */
  total: number;
  state: ExerciseProgressState;
}

export function exerciseProgress(exercise: Pick<WorkoutExercise, 'sets'>, logs: readonly Pick<SetLog, 'setNumber'>[]): ExerciseProgress {
  const numbers = new Set(logs.map((l) => l.setNumber));
  const done = numbers.size;
  const total = Math.max(exercise.sets, ...numbers);
  const state: ExerciseProgressState = done === 0 ? 'not_started' : done >= exercise.sets ? 'done' : 'in_progress';
  return { done, total, state };
}

const STATE_TEXT: Record<ExerciseProgressState, string> = {
  not_started: 'Não iniciado',
  in_progress: 'Em andamento',
  done: 'Concluído',
};

/** Texto curto do card recolhido: "2/3 séries · Em andamento". */
export function progressLabel(p: ExerciseProgress): string {
  return `${p.done}/${p.total} ${p.total === 1 ? 'série' : 'séries'} · ${STATE_TEXT[p.state]}`;
}

export function progressStateText(state: ExerciseProgressState): string {
  return STATE_TEXT[state];
}

export interface DaySessionProgress {
  /** Exercícios concluídos (todas as séries) no treino em foco. */
  completed: number;
  total: number;
}

export function sessionProgress(progresses: readonly ExerciseProgress[]): DaySessionProgress {
  return { completed: progresses.filter((p) => p.state === 'done').length, total: progresses.length };
}

/** "Treino A · 4 de 7 exercícios concluídos". */
export function sessionProgressLabel(code: string, p: DaySessionProgress): string {
  const noun = p.total === 1 ? 'exercício concluído' : 'exercícios concluídos';
  return `Treino ${code} · ${p.completed} de ${p.total} ${noun}`;
}

/** Exercício a abrir por padrão: o primeiro EM ANDAMENTO (nunca um não iniciado nem um concluído). */
export function defaultOpenExerciseId(items: readonly { id: string; progress: ExerciseProgress }[]): string | null {
  return items.find((i) => i.progress.state === 'in_progress')?.id ?? null;
}

/* ------------------------------------------------------------------ */
/* Treinos concluídos                                                  */
/* ------------------------------------------------------------------ */

/**
 * Regra de "treino concluído" (A–E), derivada só do histórico:
 *  - a SESSÃO precisa estar concluída (encerrada pelo usuário); em andamento ou
 *    cancelada nunca conta;
 *  - o treino conta se, nessa sessão, pelo menos METADE dos exercícios dele
 *    tiveram séries registradas (ao menos 1) — uma sessão geral passa por vários
 *    treinos, e uma série solta de outro dia não o transforma em "feito";
 *  - sessão concluída sem séries do treino (ex.: sessão antiga sem registros)
 *    não é adivinhada: não conta.
 * Cada sessão conta no máximo uma vez por treino, então finalizar de novo, retomar
 * ou reabrir a ficha nunca duplica.
 */
export const DAY_COMPLETION_RATIO = 0.5;

export interface DayCompletion {
  count: number;
  lastCompletedOn?: string;
}

export function countCompletedDays(input: {
  sessions: readonly Pick<WorkoutSession, 'id' | 'status' | 'sessionDate'>[];
  /** Pares (sessão, exercício) com ao menos uma série registrada. */
  touches: readonly { sessionId: string; exerciseId: string }[];
  exercises: readonly Pick<WorkoutExercise, 'id' | 'dayId' | 'removedAt' | 'hiddenAt'>[];
}): Map<string, DayCompletion> {
  const dayOf = new Map(input.exercises.map((e) => [e.id, e.dayId]));
  const activeByDay = new Map<string, number>();
  for (const e of input.exercises) {
    if (e.removedAt || e.hiddenAt) continue;
    activeByDay.set(e.dayId, (activeByDay.get(e.dayId) ?? 0) + 1);
  }
  const completed = new Map(input.sessions.filter((s) => s.status === 'completed').map((s) => [s.id, s]));

  // sessão → dia → exercícios distintos tocados
  const touched = new Map<string, Map<string, Set<string>>>();
  for (const t of input.touches) {
    if (!completed.has(t.sessionId)) continue;
    const dayId = dayOf.get(t.exerciseId);
    if (!dayId) continue;
    const perDay = touched.get(t.sessionId) ?? new Map<string, Set<string>>();
    const set = perDay.get(dayId) ?? new Set<string>();
    set.add(t.exerciseId);
    perDay.set(dayId, set);
    touched.set(t.sessionId, perDay);
  }

  const result = new Map<string, DayCompletion>();
  for (const [sessionId, perDay] of touched) {
    const session = completed.get(sessionId)!;
    for (const [dayId, exerciseIds] of perDay) {
      const active = activeByDay.get(dayId) ?? 0;
      const needed = Math.max(1, Math.ceil(active * DAY_COMPLETION_RATIO));
      if (exerciseIds.size < needed) continue;
      const current = result.get(dayId) ?? { count: 0 };
      current.count += 1;
      if (!current.lastCompletedOn || session.sessionDate > current.lastCompletedOn) current.lastCompletedOn = session.sessionDate;
      result.set(dayId, current);
    }
  }
  return result;
}

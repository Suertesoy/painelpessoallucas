import type { WorkoutRepository } from './workout.repository';
import type {
  BodyWeightLog,
  ExerciseLoad,
  SetLog,
  WorkoutAthlete,
  WorkoutDay,
  WorkoutExercise,
  WorkoutSession,
} from '../domain/workout.schema';
import { buildExerciseSeries, previousPerformance, type ExercisePoint } from '../domain/workout-stats';
import { buildHistory, type HistoryEntry } from '../domain/workout-history';
import { LEGACY_COMPLETION_CUTOFF, countCompletedDays, countExplicitCompletions, exerciseProgress, sessionProgress, type DaySessionProgress, type ExerciseProgress } from '../domain/workout-progress';

const RECENT_SESSIONS = 60;
const RECENT_SET_LOGS = 800;
/** Teto de sessões lidas para contar treinos concluídos (anos de treino cabem folgados). */
const ALL_SESSIONS = 1000;

export interface RoutineDayView {
  day: WorkoutDay;
  /** Exercícios ativos (visíveis), na ordem prescrita. */
  exercises: WorkoutExercise[];
  /** Ocultos: fora do treino, mas ainda geridos aqui. */
  hidden: WorkoutExercise[];
}

export interface RoutineView {
  athletes: WorkoutAthlete[];
  days: RoutineDayView[];
  loads: ExerciseLoad[];
  removedCount: number;
}

export interface AthleteOverview {
  athlete: WorkoutAthlete;
  days: Array<{
    day: WorkoutDay;
    exerciseCount: number;
    /** Última EXECUÇÃO: último dia com séries registradas deste treino (sessão não cancelada). */
    lastDoneOn?: string;
    loggedInActive: number;
    /** Quantas vezes este treino foi CONCLUÍDO explicitamente ("Concluir Treino") por este atleta. */
    completedCount: number;
    /** Data da última sessão com conclusão explícita. */
    lastCompletedOn?: string;
    /** LEGADO: conclusões estimadas de sessões anteriores ao botão (heurística antiga); separado de `completedCount`. */
    legacyCompletedCount?: number;
    legacyLastCompletedOn?: string;
  }>;
  activeSession: WorkoutSession | null;
  recentSessions: WorkoutSession[];
}

export interface SessionExerciseView {
  exercise: WorkoutExercise;
  /** Carga atual do atleta (planilha/edição). */
  currentLoad?: ExerciseLoad;
  /** Séries já registradas NESTA sessão. */
  logs: SetLog[];
  /** Progresso do atleta da sessão neste exercício, vindo dos registros reais. */
  progress: ExerciseProgress;
  /** Última vez que este atleta fez o exercício. */
  previous: { date: string; sets: SetLog[] } | null;
  /** Carga atual de CADA pessoa (para treinar junto e ver/editar a do outro). */
  loadsByAthlete: Record<string, ExerciseLoad | undefined>;
  /** Última vez de CADA pessoa neste exercício. */
  previousByAthlete: Record<string, { date: string; sets: SetLog[] } | null>;
}

export interface SessionView {
  session: WorkoutSession;
  athlete: WorkoutAthlete;
  /** Todas as pessoas da rotina (Lucas e Matheus) — alimenta o seletor dentro do treino. */
  athletes: WorkoutAthlete[];
  /** Treino em foco agora (muda sem reiniciar a sessão). */
  day: WorkoutDay;
  /** Todos os treinos (A–E): troca de foco em um toque. */
  days: WorkoutDay[];
  /** Séries registradas na sessão inteira, de qualquer treino. */
  totalSets: number;
  /** Séries registradas por treino (dia) nesta sessão. */
  setsByDay: Record<string, number>;
  exercises: SessionExerciseView[];
  /** Exercícios concluídos no treino em foco (para o indicador do topo). */
  dayProgress: DaySessionProgress;
  /** Fichas já concluídas explicitamente nesta sessão. */
  completedDayIds: string[];
}

/** Um treino (A–E) para consultar SEM iniciar nada. */
export interface DayPreview {
  athlete: WorkoutAthlete;
  athletes: WorkoutAthlete[];
  day: WorkoutDay;
  exercises: Array<
    Pick<SessionExerciseView, 'exercise' | 'loadsByAthlete' | 'previousByAthlete'> & { hiddenCount?: never }
  >;
  /** Treino em andamento do atleta (de qualquer dia), se houver. */
  activeSession: WorkoutSession | null;
  activeDay: WorkoutDay | null;
}

export interface EvolutionView {
  athlete: WorkoutAthlete;
  exercises: Array<{ exercise: WorkoutExercise; dayCode: string; points: ExercisePoint[] }>;
  bodyWeights: BodyWeightLog[];
}

/** Exercícios que entram no treino: nem removidos nem ocultos. */
function activeExercises(all: WorkoutExercise[], dayId: string): WorkoutExercise[] {
  return all.filter((e) => e.dayId === dayId && !e.removedAt && !e.hiddenAt).sort((a, b) => a.position - b.position);
}

function hiddenExercises(all: WorkoutExercise[], dayId: string): WorkoutExercise[] {
  return all.filter((e) => e.dayId === dayId && !e.removedAt && !!e.hiddenAt).sort((a, b) => a.position - b.position);
}

export class WorkoutQueries {
  constructor(private repo: WorkoutRepository) {}

  async listAthletes(): Promise<WorkoutAthlete[]> {
    return (await this.repo.listAthletes()).sort((a, b) => a.position - b.position);
  }

  async getRoutine(): Promise<RoutineView> {
    const [athletes, days, exercises, loads] = await Promise.all([
      this.repo.listAthletes(),
      this.repo.listDays(),
      this.repo.listExercises(),
      this.repo.listLoads(),
    ]);
    return {
      athletes: athletes.sort((a, b) => a.position - b.position),
      days: days
        .sort((a, b) => a.position - b.position)
        .map((day) => ({ day, exercises: activeExercises(exercises, day.id), hidden: hiddenExercises(exercises, day.id) })),
      loads,
      removedCount: exercises.filter((e) => e.removedAt).length,
    };
  }

  async getAthleteOverview(athleteId: string): Promise<AthleteOverview | null> {
    const [athletes, days, exercises, active, recent, logs, allSessions, touches, completionRows] = await Promise.all([
      this.repo.listAthletes(),
      this.repo.listDays(),
      this.repo.listExercises(),
      this.repo.findActiveSession(athleteId),
      this.repo.listSessions(athleteId, RECENT_SESSIONS),
      this.repo.listSetLogsByAthlete(athleteId, RECENT_SET_LOGS),
      this.repo.listSessions(athleteId, ALL_SESSIONS),
      this.repo.listSetLogTouches(athleteId),
      this.repo.listDayCompletions(athleteId),
    ]);
    const athlete = athletes.find((a) => a.id === athleteId);
    if (!athlete) return null;
    // Uma sessão pode passar por vários treinos: "feito em" e "séries na sessão"
    // vêm das SÉRIES (cada exercício pertence a um dia), não do dia em foco da sessão.
    const dayOfExercise = new Map(exercises.map((e) => [e.id, e.dayId]));
    const validSessions = new Map(recent.filter((s) => s.status !== 'cancelled').map((s) => [s.id, s]));
    const lastDone = new Map<string, string>();
    const loggedInActive = new Map<string, number>();
    for (const log of logs) {
      const dayId = dayOfExercise.get(log.exerciseId);
      const session = validSessions.get(log.sessionId);
      if (!dayId || !session) continue;
      const prev = lastDone.get(dayId);
      if (!prev || session.sessionDate > prev) lastDone.set(dayId, session.sessionDate);
      if (active && log.sessionId === active.id) loggedInActive.set(dayId, (loggedInActive.get(dayId) ?? 0) + 1);
    }
    // Treinos CONCLUÍDOS: calculados do histórico completo (sessões encerradas + séries), nunca de um contador salvo.
    const explicit = countExplicitCompletions(completionRows, allSessions);
    const legacy = countCompletedDays({
      sessions: allSessions,
      touches,
      exercises,
      legacyUntil: LEGACY_COMPLETION_CUTOFF,
      explicit: new Set(completionRows.map((c) => `${c.sessionId}:${c.dayId}`)),
    });
    return {
      athlete,
      days: days
        .sort((a, b) => a.position - b.position)
        .map((day) => ({
          day,
          exerciseCount: activeExercises(exercises, day.id).length,
          lastDoneOn: lastDone.get(day.id),
          loggedInActive: loggedInActive.get(day.id) ?? 0,
          completedCount: explicit.get(day.id)?.count ?? 0,
          lastCompletedOn: explicit.get(day.id)?.lastCompletedOn,
          legacyCompletedCount: legacy.get(day.id)?.count,
          legacyLastCompletedOn: legacy.get(day.id)?.lastCompletedOn,
        })),
      activeSession: active,
      recentSessions: recent.slice(0, 10),
    };
  }

  async getActiveSession(athleteId: string): Promise<WorkoutSession | null> {
    return this.repo.findActiveSession(athleteId);
  }

  /** Qualquer sessão de treino em andamento (para o atalho global de retorno). */
  async findAnyActiveSession(): Promise<WorkoutSession | null> {
    const athletes = await this.repo.listAthletes();
    for (const athlete of athletes) {
      const session = await this.repo.findActiveSession(athlete.id);
      if (session) return session;
    }
    return null;
  }

  /** Última vez de cada pessoa em cada exercício (olha as séries recentes de todas). */
  private async perAthleteHistory(athletes: WorkoutAthlete[]) {
    const entries = await Promise.all(
      athletes.map(async (a) => {
        const [logs, sessions] = await Promise.all([
          this.repo.listSetLogsByAthlete(a.id, RECENT_SET_LOGS),
          this.repo.listSessions(a.id, RECENT_SESSIONS),
        ]);
        return [a.id, { logs, sessions }] as const;
      })
    );
    return new Map(entries);
  }

  async getSessionView(sessionId: string): Promise<SessionView | null> {
    const session = await this.repo.findSession(sessionId);
    if (!session) return null;
    const [athletes, days, exercises, loads, allLogs] = await Promise.all([
      this.repo.listAthletes(),
      this.repo.listDays(),
      this.repo.listExercises(),
      this.repo.listLoads(),
      this.repo.listSetLogsBySession(sessionId),
    ]);
    const athlete = athletes.find((a) => a.id === session.athleteId);
    const day = days.find((d) => d.id === session.dayId);
    const dayOfExercise = new Map(exercises.map((e) => [e.id, e.dayId]));
    const setsByDay: Record<string, number> = {};
    for (const l of allLogs) {
      const d = dayOfExercise.get(l.exerciseId);
      if (d) setsByDay[d] = (setsByDay[d] ?? 0) + 1;
    }
    const logs = allLogs;
    if (!athlete || !day) return null;
    const history = await this.perAthleteHistory(athletes);
    const completedDayIds = (await this.repo.listDayCompletions(session.athleteId)).filter((c) => c.sessionId === sessionId).map((c) => c.dayId);

    // Exercícios do dia + qualquer exercício removido que já tenha série nesta sessão.
    const loggedIds = new Set(logs.map((l) => l.exerciseId));
    const dayExercises = exercises
      .filter((e) => e.dayId === day.id && ((!e.removedAt && !e.hiddenAt) || loggedIds.has(e.id)))
      .sort((a, b) => a.position - b.position);

    const exerciseViews: SessionExerciseView[] = dayExercises.map((exercise) => {
      const loadsByAthlete: SessionExerciseView['loadsByAthlete'] = {};
      const previousByAthlete: SessionExerciseView['previousByAthlete'] = {};
      for (const a of athletes) {
        loadsByAthlete[a.id] = loads.find((l) => l.exerciseId === exercise.id && l.athleteId === a.id);
        const h = history.get(a.id)!;
        previousByAthlete[a.id] = previousPerformance(h.logs, h.sessions, exercise.id, sessionId);
      }
      const exerciseLogs = logs.filter((l) => l.exerciseId === exercise.id).sort((a, b) => a.setNumber - b.setNumber);
      return {
        exercise,
        currentLoad: loadsByAthlete[athlete.id],
        logs: exerciseLogs,
        progress: exerciseProgress(exercise, exerciseLogs),
        previous: previousByAthlete[athlete.id],
        loadsByAthlete,
        previousByAthlete,
      };
    });

    return {
      session,
      athlete,
      athletes: athletes.sort((a, b) => a.position - b.position),
      day,
      days: [...days].sort((a, b) => a.position - b.position),
      totalSets: allLogs.length,
      setsByDay,
      exercises: exerciseViews,
      dayProgress: sessionProgress(exerciseViews.map((v) => v.progress)),
      completedDayIds,
    };
  }

  /** Consultar um treino (e as cargas dos dois) sem iniciar sessão nenhuma. */
  async getDayPreview(athleteId: string, dayId: string): Promise<DayPreview | null> {
    const [athletes, days, exercises, loads, active] = await Promise.all([
      this.repo.listAthletes(),
      this.repo.listDays(),
      this.repo.listExercises(),
      this.repo.listLoads(),
      this.repo.findActiveSession(athleteId),
    ]);
    const athlete = athletes.find((a) => a.id === athleteId);
    const day = days.find((d) => d.id === dayId);
    if (!athlete || !day) return null;
    const history = await this.perAthleteHistory(athletes);
    return {
      athlete,
      athletes: athletes.sort((a, b) => a.position - b.position),
      day,
      activeSession: active,
      activeDay: active ? (days.find((d) => d.id === active.dayId) ?? null) : null,
      exercises: activeExercises(exercises, dayId).map((exercise) => {
        const loadsByAthlete: SessionExerciseView['loadsByAthlete'] = {};
        const previousByAthlete: SessionExerciseView['previousByAthlete'] = {};
        for (const a of athletes) {
          loadsByAthlete[a.id] = loads.find((l) => l.exerciseId === exercise.id && l.athleteId === a.id);
          const h = history.get(a.id)!;
          previousByAthlete[a.id] = previousPerformance(h.logs, h.sessions, exercise.id, '');
        }
        return { exercise, loadsByAthlete, previousByAthlete };
      }),
    };
  }

  /** Histórico de treinos do atleta (mais recente primeiro), com as séries reais de cada sessão. */
  async getWorkoutHistory(athleteId: string, limit = 30): Promise<{ athlete: WorkoutAthlete; entries: HistoryEntry[]; hasMore: boolean } | null> {
    const [athletes, days, exercises, sessions, completions] = await Promise.all([
      this.repo.listAthletes(),
      this.repo.listDays(),
      this.repo.listExercises(),
      this.repo.listSessions(athleteId, limit + 1),
      this.repo.listDayCompletions(athleteId),
    ]);
    const athlete = athletes.find((a) => a.id === athleteId);
    if (!athlete) return null;
    const page = sessions.slice(0, limit);
    const logs = await this.repo.listSetLogsForSessions(page.map((s) => s.id));
    return { athlete, entries: buildHistory({ sessions: page, logs, exercises, days, completions, athleteId }), hasMore: sessions.length > limit };
  }

  async getEvolution(athleteId: string): Promise<EvolutionView | null> {
    const [athletes, days, exercises, logs, sessions, bodyWeights] = await Promise.all([
      this.repo.listAthletes(),
      this.repo.listDays(),
      this.repo.listExercises(),
      this.repo.listSetLogsByAthlete(athleteId, RECENT_SET_LOGS),
      this.repo.listSessions(athleteId, 200),
      this.repo.listBodyWeights(athleteId),
    ]);
    const athlete = athletes.find((a) => a.id === athleteId);
    if (!athlete) return null;
    const dayCode = new Map(days.map((d) => [d.id, d.code]));
    return {
      athlete,
      exercises: exercises
        .sort((a, b) => a.position - b.position)
        .map((exercise) => ({
          exercise,
          dayCode: dayCode.get(exercise.dayId) ?? '?',
          points: buildExerciseSeries(logs, sessions, exercise.id),
        }))
        .filter((e) => e.points.length > 0)
        .sort((a, b) => a.dayCode.localeCompare(b.dayCode) || a.exercise.position - b.exercise.position),
      bodyWeights: bodyWeights.sort((a, b) => (a.loggedOn < b.loggedOn ? -1 : 1)),
    };
  }
}

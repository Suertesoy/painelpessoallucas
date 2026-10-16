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

const RECENT_SESSIONS = 60;
const RECENT_SET_LOGS = 800;

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
  days: Array<{ day: WorkoutDay; exerciseCount: number; lastDoneOn?: string }>;
  activeSession: WorkoutSession | null;
  recentSessions: WorkoutSession[];
}

export interface SessionExerciseView {
  exercise: WorkoutExercise;
  /** Carga atual do atleta (planilha/edição). */
  currentLoad?: ExerciseLoad;
  /** Séries já registradas NESTA sessão. */
  logs: SetLog[];
  /** Última vez que este atleta fez o exercício. */
  previous: { date: string; sets: SetLog[] } | null;
}

export interface SessionView {
  session: WorkoutSession;
  athlete: WorkoutAthlete;
  day: WorkoutDay;
  exercises: SessionExerciseView[];
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
    const [athletes, days, exercises, active, recent] = await Promise.all([
      this.repo.listAthletes(),
      this.repo.listDays(),
      this.repo.listExercises(),
      this.repo.findActiveSession(athleteId),
      this.repo.listSessions(athleteId, RECENT_SESSIONS),
    ]);
    const athlete = athletes.find((a) => a.id === athleteId);
    if (!athlete) return null;
    const completed = recent.filter((s) => s.status === 'completed');
    return {
      athlete,
      days: days
        .sort((a, b) => a.position - b.position)
        .map((day) => ({
          day,
          exerciseCount: activeExercises(exercises, day.id).length,
          lastDoneOn: completed.find((s) => s.dayId === day.id)?.sessionDate,
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

  async getSessionView(sessionId: string): Promise<SessionView | null> {
    const session = await this.repo.findSession(sessionId);
    if (!session) return null;
    const [athletes, days, exercises, loads, logs, recentLogs, sessions] = await Promise.all([
      this.repo.listAthletes(),
      this.repo.listDays(),
      this.repo.listExercises(),
      this.repo.listLoads(),
      this.repo.listSetLogsBySession(sessionId),
      this.repo.listSetLogsByAthlete(session.athleteId, RECENT_SET_LOGS),
      this.repo.listSessions(session.athleteId, RECENT_SESSIONS),
    ]);
    const athlete = athletes.find((a) => a.id === session.athleteId);
    const day = days.find((d) => d.id === session.dayId);
    if (!athlete || !day) return null;

    // Exercícios do dia + qualquer exercício removido que já tenha série nesta sessão.
    const loggedIds = new Set(logs.map((l) => l.exerciseId));
    const dayExercises = exercises
      .filter((e) => e.dayId === day.id && ((!e.removedAt && !e.hiddenAt) || loggedIds.has(e.id)))
      .sort((a, b) => a.position - b.position);

    return {
      session,
      athlete,
      day,
      exercises: dayExercises.map((exercise) => ({
        exercise,
        currentLoad: loads.find((l) => l.exerciseId === exercise.id && l.athleteId === athlete.id),
        logs: logs.filter((l) => l.exerciseId === exercise.id).sort((a, b) => a.setNumber - b.setNumber),
        previous: previousPerformance(recentLogs, sessions, exercise.id, sessionId),
      })),
    };
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

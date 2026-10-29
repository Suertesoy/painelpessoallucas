import type {
  BodyWeightLog,
  DayCompletion,
  ExerciseLoad,
  SetLog,
  WorkoutAthlete,
  WorkoutDay,
  WorkoutExercise,
  WorkoutSession,
} from '../domain/workout.schema';

/**
 * Persistência de Treinos. O workspace é resolvido na construção do
 * repositório. Um único contrato cobre atletas, rotina, cargas, sessões,
 * séries e peso corporal: as entidades só fazem sentido juntas e mudam
 * juntas durante um treino.
 */
export interface WorkoutRepository {
  // Atletas e rotina
  listAthletes(): Promise<WorkoutAthlete[]>;
  saveAthletes(athletes: WorkoutAthlete[]): Promise<void>;
  listDays(): Promise<WorkoutDay[]>;
  saveDays(days: WorkoutDay[]): Promise<void>;
  /** Inclui exercícios removidos (histórico os referencia). */
  listExercises(): Promise<WorkoutExercise[]>;
  findExercise(id: string): Promise<WorkoutExercise | null>;
  saveExercises(exercises: WorkoutExercise[]): Promise<void>;
  /**
   * Troca SÓ o nome (atualização de uma coluna): mantém id, cargas, séries, descanso e
   * qualquer edição simultânea da outra pessoa nos demais campos. Devolve o exercício atualizado.
   */
  renameExercise(id: string, name: string): Promise<WorkoutExercise | null>;

  // Cargas atuais por atleta
  listLoads(): Promise<ExerciseLoad[]>;
  saveLoads(loads: ExerciseLoad[]): Promise<void>;

  // Sessões
  findSession(id: string): Promise<WorkoutSession | null>;
  findActiveSession(athleteId: string): Promise<WorkoutSession | null>;
  /** Mais recentes primeiro. */
  listSessions(athleteId: string, limit: number): Promise<WorkoutSession[]>;
  saveSession(session: WorkoutSession): Promise<void>;
  /**
   * Exclusão lógica da sessão INTEIRA (todas as fichas) de um atleta; `deleted=false` restaura.
   * Devolve null se a sessão não existe. Erra se for de outro atleta ou estiver em andamento.
   * Sessões excluídas somem de findSession, listSessions, séries e conclusões do atleta.
   */
  setSessionDeleted(athleteId: string, sessionId: string, deleted: boolean): Promise<WorkoutSession | null>;
  /** Sessões excluídas do atleta, mais recentes primeiro (para restaurar). */
  listDeletedSessions(athleteId: string, limit: number): Promise<WorkoutSession[]>;

  // Séries
  listSetLogsBySession(sessionId: string): Promise<SetLog[]>;
  /** Mais recentes primeiro, limitadas — base de última carga e gráficos. */
  listSetLogsByAthlete(athleteId: string, limit: number): Promise<SetLog[]>;
  /**
   * Pares (sessão, exercício) com ao menos uma série de TODO o histórico do atleta —
   * base da contagem de treinos concluídos (sem o teto das listas recentes).
   */
  listSetLogTouches(athleteId: string): Promise<Array<{ sessionId: string; exerciseId: string }>>;
  saveSetLog(log: SetLog): Promise<void>;
  deleteSetLog(id: string): Promise<void>;

  /** Séries de várias sessões (histórico). */
  listSetLogsForSessions(sessionIds: string[]): Promise<SetLog[]>;

  // Conclusões explícitas de ficha
  listDayCompletions(athleteId: string): Promise<DayCompletion[]>;
  /** Idempotente por (sessão, ficha): se já existe, mantém a original. */
  saveDayCompletion(completion: DayCompletion): Promise<void>;

  // Peso corporal
  listBodyWeights(athleteId: string): Promise<BodyWeightLog[]>;
  saveBodyWeight(log: BodyWeightLog): Promise<void>;
  deleteBodyWeight(id: string): Promise<void>;

  subscribe(listener: () => void): () => void;
}

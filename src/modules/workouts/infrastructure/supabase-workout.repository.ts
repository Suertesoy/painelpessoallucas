'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { ChangeNotifier } from '@/platform/supabase/change-notifier';
import { WorkoutRepository } from '../application/workout.repository';
import {
  BodyWeightLog,
  BodyWeightLogSchema,
  DayCompletion,
  DayCompletionSchema,
  ExerciseLoad,
  ExerciseLoadSchema,
  SetLog,
  SetLogSchema,
  WorkoutAthlete,
  WorkoutAthleteSchema,
  WorkoutDay,
  WorkoutDaySchema,
  WorkoutExercise,
  WorkoutExerciseSchema,
  WorkoutSession,
  WorkoutSessionSchema,
} from '../domain/workout.schema';

type Row = Record<string, unknown>;

/** numeric(…) pode chegar como string em alguns clientes; normaliza para número. */
const num = (v: unknown): number | undefined => (v == null ? undefined : Number(v));

function athleteFromRow(r: Row): WorkoutAthlete {
  return WorkoutAthleteSchema.parse({
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    userId: r.user_id ?? undefined,
    position: r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
}

function dayFromRow(r: Row): WorkoutDay {
  return WorkoutDaySchema.parse({
    id: r.id,
    workspaceId: r.workspace_id,
    code: r.code,
    title: r.title ?? undefined,
    position: r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
}

function exerciseFromRow(r: Row): WorkoutExercise {
  return WorkoutExerciseSchema.parse({
    id: r.id,
    workspaceId: r.workspace_id,
    dayId: r.day_id,
    position: r.position,
    name: r.name,
    sets: r.sets,
    repsMin: r.reps_min ?? undefined,
    repsMax: r.reps_max ?? undefined,
    repsNote: r.reps_note ?? undefined,
    restSeconds: r.rest_seconds ?? undefined,
    restNote: r.rest_note ?? undefined,
    instructions: r.instructions ?? undefined,
    imageUrl: r.image_url ?? undefined,
    videoUrl: r.video_url ?? undefined,
    sourceNote: r.source_note ?? undefined,
    needsReview: r.needs_review,
    hiddenAt: r.hidden_at ?? undefined,
    removedAt: r.removed_at ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
}

function loadFromRow(r: Row): ExerciseLoad {
  return ExerciseLoadSchema.parse({
    workspaceId: r.workspace_id,
    exerciseId: r.exercise_id,
    athleteId: r.athlete_id,
    loadKg: num(r.load_kg),
    loadNote: r.load_note ?? undefined,
    updatedAt: r.updated_at,
  });
}

function sessionFromRow(r: Row): WorkoutSession {
  return WorkoutSessionSchema.parse({
    id: r.id,
    workspaceId: r.workspace_id,
    athleteId: r.athlete_id,
    dayId: r.day_id,
    sessionDate: r.session_date,
    startedAt: r.started_at,
    endedAt: r.ended_at ?? undefined,
    status: r.status,
    restEndsAt: r.rest_ends_at ?? undefined,
    restDurationSeconds: r.rest_duration_seconds ?? undefined,
    restPausedRemainingSeconds: r.rest_paused_remaining_seconds ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
}

function setLogFromRow(r: Row): SetLog {
  return SetLogSchema.parse({
    id: r.id,
    workspaceId: r.workspace_id,
    sessionId: r.session_id,
    athleteId: r.athlete_id,
    exerciseId: r.exercise_id,
    setNumber: r.set_number,
    loadKg: num(r.load_kg),
    reps: r.reps,
    completedAt: r.completed_at,
    createdAt: r.created_at,
  });
}

function bodyWeightFromRow(r: Row): BodyWeightLog {
  return BodyWeightLogSchema.parse({
    id: r.id,
    workspaceId: r.workspace_id,
    athleteId: r.athlete_id,
    weightKg: Number(r.weight_kg),
    loggedOn: r.logged_on,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
}

export class SupabaseWorkoutRepository implements WorkoutRepository {
  constructor(
    private supabase: SupabaseClient,
    private workspaceId: string,
    private notifier: ChangeNotifier
  ) {}

  private fail(action: string, error: { message: string }): never {
    throw new Error(`Não foi possível ${action}: ${error.message}`);
  }

  // --- Atletas e rotina ---------------------------------------------------------

  async listAthletes(): Promise<WorkoutAthlete[]> {
    const { data, error } = await this.supabase
      .from('workout_athletes')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .order('position');
    if (error) this.fail('carregar as pessoas do treino', error);
    return (data ?? []).map(athleteFromRow);
  }

  async saveAthletes(athletes: WorkoutAthlete[]): Promise<void> {
    const { error } = await this.supabase.from('workout_athletes').upsert(
      athletes.map((a) => ({
        id: a.id,
        workspace_id: a.workspaceId,
        name: a.name,
        user_id: a.userId ?? null,
        position: a.position,
        created_at: a.createdAt,
      })),
      { onConflict: 'id' }
    );
    if (error) this.fail('salvar as pessoas do treino', error);
    this.notifier.notify();
  }

  async listDays(): Promise<WorkoutDay[]> {
    const { data, error } = await this.supabase
      .from('workout_days')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .order('position');
    if (error) this.fail('carregar os dias de treino', error);
    return (data ?? []).map(dayFromRow);
  }

  async saveDays(days: WorkoutDay[]): Promise<void> {
    const { error } = await this.supabase.from('workout_days').upsert(
      days.map((d) => ({
        id: d.id,
        workspace_id: d.workspaceId,
        code: d.code,
        title: d.title ?? null,
        position: d.position,
        created_at: d.createdAt,
      })),
      { onConflict: 'id' }
    );
    if (error) this.fail('salvar os dias de treino', error);
    this.notifier.notify();
  }

  async listExercises(): Promise<WorkoutExercise[]> {
    const { data, error } = await this.supabase
      .from('workout_exercises')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .order('position');
    if (error) this.fail('carregar os exercícios', error);
    return (data ?? []).map(exerciseFromRow);
  }

  async findExercise(id: string): Promise<WorkoutExercise | null> {
    const { data, error } = await this.supabase.from('workout_exercises').select('*').eq('id', id).maybeSingle();
    if (error) this.fail('carregar o exercício', error);
    return data ? exerciseFromRow(data) : null;
  }

  async saveExercises(exercises: WorkoutExercise[]): Promise<void> {
    const { error } = await this.supabase.from('workout_exercises').upsert(
      exercises.map((e) => ({
        id: e.id,
        workspace_id: e.workspaceId,
        day_id: e.dayId,
        position: e.position,
        name: e.name,
        sets: e.sets,
        reps_min: e.repsMin ?? null,
        reps_max: e.repsMax ?? null,
        reps_note: e.repsNote ?? null,
        rest_seconds: e.restSeconds ?? null,
        rest_note: e.restNote ?? null,
        instructions: e.instructions ?? null,
        image_url: e.imageUrl ?? null,
        video_url: e.videoUrl ?? null,
        source_note: e.sourceNote ?? null,
        needs_review: e.needsReview,
        hidden_at: e.hiddenAt ?? null,
        removed_at: e.removedAt ?? null,
        created_at: e.createdAt,
      })),
      { onConflict: 'id' }
    );
    if (error) this.fail('salvar os exercícios', error);
    this.notifier.notify();
  }

  async renameExercise(id: string, name: string): Promise<WorkoutExercise | null> {
    const { data, error } = await this.supabase
      .from('workout_exercises')
      .update({ name })
      .eq('id', id)
      .eq('workspace_id', this.workspaceId)
      .select('*')
      .maybeSingle();
    if (error) this.fail('renomear o exercício', error);
    this.notifier.notify();
    return data ? exerciseFromRow(data) : null;
  }

  // --- Cargas ----------------------------------------------------------------------------

  async listLoads(): Promise<ExerciseLoad[]> {
    const { data, error } = await this.supabase
      .from('workout_exercise_loads')
      .select('*')
      .eq('workspace_id', this.workspaceId);
    if (error) this.fail('carregar as cargas', error);
    return (data ?? []).map(loadFromRow);
  }

  async saveLoads(loads: ExerciseLoad[]): Promise<void> {
    const { error } = await this.supabase.from('workout_exercise_loads').upsert(
      loads.map((l) => ({
        workspace_id: l.workspaceId,
        exercise_id: l.exerciseId,
        athlete_id: l.athleteId,
        load_kg: l.loadKg ?? null,
        load_note: l.loadNote ?? null,
        updated_at: l.updatedAt,
      })),
      { onConflict: 'exercise_id,athlete_id' }
    );
    if (error) this.fail('salvar as cargas', error);
    this.notifier.notify();
  }

  // --- Sessões -----------------------------------------------------------------------------

  async findSession(id: string): Promise<WorkoutSession | null> {
    const { data, error } = await this.supabase.from('workout_sessions').select('*').eq('id', id).maybeSingle();
    if (error) this.fail('carregar o treino', error);
    return data ? sessionFromRow(data) : null;
  }

  async findActiveSession(athleteId: string): Promise<WorkoutSession | null> {
    const { data, error } = await this.supabase
      .from('workout_sessions')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('status', 'in_progress')
      .maybeSingle();
    if (error) this.fail('verificar o treino em andamento', error);
    return data ? sessionFromRow(data) : null;
  }

  async listSessions(athleteId: string, limit: number): Promise<WorkoutSession[]> {
    const { data, error } = await this.supabase
      .from('workout_sessions')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) this.fail('carregar o histórico de treinos', error);
    return (data ?? []).map(sessionFromRow);
  }

  async saveSession(session: WorkoutSession): Promise<void> {
    const { error } = await this.supabase.from('workout_sessions').upsert(
      {
        id: session.id,
        workspace_id: session.workspaceId,
        athlete_id: session.athleteId,
        day_id: session.dayId,
        session_date: session.sessionDate,
        started_at: session.startedAt,
        ended_at: session.endedAt ?? null,
        status: session.status,
        rest_ends_at: session.restEndsAt ?? null,
        rest_duration_seconds: session.restDurationSeconds ?? null,
        rest_paused_remaining_seconds: session.restPausedRemainingSeconds ?? null,
        created_at: session.createdAt,
      },
      { onConflict: 'id' }
    );
    if (error) this.fail('salvar o treino', error);
    this.notifier.notify();
  }

  // --- Séries ----------------------------------------------------------------------------------

  async listSetLogsBySession(sessionId: string): Promise<SetLog[]> {
    const { data, error } = await this.supabase
      .from('workout_set_logs')
      .select('*')
      .eq('session_id', sessionId)
      .order('completed_at');
    if (error) this.fail('carregar as séries do treino', error);
    return (data ?? []).map(setLogFromRow);
  }

  async listSetLogsByAthlete(athleteId: string, limit: number): Promise<SetLog[]> {
    const { data, error } = await this.supabase
      .from('workout_set_logs')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('completed_at', { ascending: false })
      .limit(limit);
    if (error) this.fail('carregar o histórico de séries', error);
    return (data ?? []).map(setLogFromRow);
  }

  async listSetLogTouches(athleteId: string): Promise<Array<{ sessionId: string; exerciseId: string }>> {
    // O PostgREST devolve no máximo 1.000 linhas por pedido: pagina até acabar, para a
    // contagem não perder histórico antigo.
    const PAGE = 1000;
    const seen = new Set<string>();
    const out: Array<{ sessionId: string; exerciseId: string }> = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.supabase
        .from('workout_set_logs')
        .select('session_id, exercise_id')
        .eq('athlete_id', athleteId)
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) this.fail('carregar o histórico de séries', error);
      for (const r of data ?? []) {
        const key = `${r.session_id}:${r.exercise_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ sessionId: r.session_id as string, exerciseId: r.exercise_id as string });
      }
      if ((data ?? []).length < PAGE) break;
    }
    return out;
  }

  async listSetLogsForSessions(sessionIds: string[]): Promise<SetLog[]> {
    const out: SetLog[] = [];
    // Em blocos: mantém cada pedido abaixo do teto de 1.000 linhas do PostgREST.
    for (let i = 0; i < sessionIds.length; i += 20) {
      const { data, error } = await this.supabase
        .from('workout_set_logs')
        .select('*')
        .in('session_id', sessionIds.slice(i, i + 20))
        .order('completed_at');
      if (error) this.fail('carregar as séries do histórico', error);
      out.push(...(data ?? []).map(setLogFromRow));
    }
    return out;
  }

  async listDayCompletions(athleteId: string): Promise<DayCompletion[]> {
    const { data, error } = await this.supabase
      .from('workout_day_completions')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('completed_at');
    if (error) this.fail('carregar os treinos concluídos', error);
    return (data ?? []).map((r) =>
      DayCompletionSchema.parse({
        id: r.id,
        workspaceId: r.workspace_id,
        athleteId: r.athlete_id,
        sessionId: r.session_id,
        dayId: r.day_id,
        completedAt: r.completed_at,
        createdAt: r.created_at,
      })
    );
  }

  async saveDayCompletion(c: DayCompletion): Promise<void> {
    // ignoreDuplicates => ON CONFLICT DO NOTHING: tocar de novo nunca reescreve a conclusão original.
    const { error } = await this.supabase.from('workout_day_completions').upsert(
      {
        id: c.id,
        workspace_id: c.workspaceId,
        athlete_id: c.athleteId,
        session_id: c.sessionId,
        day_id: c.dayId,
        completed_at: c.completedAt,
      },
      { onConflict: 'session_id,day_id', ignoreDuplicates: true }
    );
    if (error) this.fail('concluir o treino', error);
    this.notifier.notify();
  }

  async saveSetLog(log: SetLog): Promise<void> {
    // created_at fica de fora de propósito: corrigir uma série não reescreve a criação.
    const { error } = await this.supabase.from('workout_set_logs').upsert(
      {
        id: log.id,
        workspace_id: log.workspaceId,
        session_id: log.sessionId,
        athlete_id: log.athleteId,
        exercise_id: log.exerciseId,
        set_number: log.setNumber,
        load_kg: log.loadKg ?? null,
        reps: log.reps,
        completed_at: log.completedAt,
      },
      { onConflict: 'id' }
    );
    if (error) this.fail('registrar a série', error);
    this.notifier.notify();
  }

  async deleteSetLog(id: string): Promise<void> {
    const { error } = await this.supabase.from('workout_set_logs').delete().eq('id', id);
    if (error) this.fail('desfazer a série', error);
    this.notifier.notify();
  }

  // --- Peso corporal ---------------------------------------------------------------------------

  async listBodyWeights(athleteId: string): Promise<BodyWeightLog[]> {
    const { data, error } = await this.supabase
      .from('workout_body_weights')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('logged_on');
    if (error) this.fail('carregar o peso corporal', error);
    return (data ?? []).map(bodyWeightFromRow);
  }

  async saveBodyWeight(log: BodyWeightLog): Promise<void> {
    const { error } = await this.supabase.from('workout_body_weights').upsert(
      {
        id: log.id,
        workspace_id: log.workspaceId,
        athlete_id: log.athleteId,
        weight_kg: log.weightKg,
        logged_on: log.loggedOn,
      },
      { onConflict: 'athlete_id,logged_on' }
    );
    if (error) this.fail('salvar o peso corporal', error);
    this.notifier.notify();
  }

  async deleteBodyWeight(id: string): Promise<void> {
    const { error } = await this.supabase.from('workout_body_weights').delete().eq('id', id);
    if (error) this.fail('remover o registro de peso', error);
    this.notifier.notify();
  }

  subscribe(listener: () => void): () => void {
    return this.notifier.subscribe(listener);
  }
}

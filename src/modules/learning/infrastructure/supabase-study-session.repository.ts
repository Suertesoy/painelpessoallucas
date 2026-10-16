'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { StudySession, StudySessionSchema } from '../domain/learning.schema';
import { StudySessionRepository } from '../application/study-session.repository';
import { ChangeNotifier } from '@/platform/supabase/change-notifier';

type Row = Record<string, unknown>;

function rowToDomain(row: Row): StudySession {
  return StudySessionSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    courseId: row.course_id,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    durationMinutes: row.duration_minutes ?? undefined,
    status: row.status,
    source: row.source,
    dailyGoalMinutesSnapshot: row.daily_goal_minutes_snapshot,
    pausedAt: row.paused_at ?? undefined,
    pausedTotalSeconds: row.paused_total_seconds ?? undefined,
    activeSeconds: row.active_seconds ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class SupabaseStudySessionRepository implements StudySessionRepository {
  constructor(
    private supabase: SupabaseClient,
    private workspaceId: string,
    private notifier: ChangeNotifier,
    /** Cursos visíveis ao usuário: sessões de outra pessoa da casa nunca aparecem. */
    private visibleCourseIds?: () => Promise<string[]>
  ) {}

  private async scope(): Promise<string[] | null> {
    return this.visibleCourseIds ? this.visibleCourseIds() : null;
  }

  async save(session: StudySession): Promise<void> {
    const { error } = await this.supabase.from('study_sessions').upsert(
      {
        id: session.id,
        workspace_id: session.workspaceId,
        course_id: session.courseId,
        started_at: session.startedAt,
        ended_at: session.endedAt ?? null,
        duration_minutes: session.durationMinutes ?? null,
        status: session.status,
        source: session.source,
        daily_goal_minutes_snapshot: session.dailyGoalMinutesSnapshot,
        paused_at: session.pausedAt ?? null,
        paused_total_seconds: session.pausedTotalSeconds ?? 0,
        active_seconds: session.activeSeconds ?? null,
        created_at: session.createdAt,
      },
      { onConflict: 'id' }
    );
    if (error) throw new Error(`Não foi possível salvar a sessão de estudo: ${error.message}`);
    this.notifier.notify();
  }

  async findById(id: string): Promise<StudySession | null> {
    const { data, error } = await this.supabase
      .from('study_sessions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível carregar a sessão de estudo: ${error.message}`);
    return data ? rowToDomain(data) : null;
  }

  async findActive(): Promise<StudySession | null> {
    const scope = await this.scope();
    if (scope && scope.length === 0) return null;
    let query = this.supabase
      .from('study_sessions')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('status', 'in_progress');
    if (scope) query = query.in('course_id', scope);
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw new Error(`Não foi possível verificar a sessão em andamento: ${error.message}`);
    return data ? rowToDomain(data) : null;
  }

  async findByDateRange(startISO: string, endISO: string): Promise<StudySession[]> {
    const scope = await this.scope();
    if (scope && scope.length === 0) return [];
    let query = this.supabase
      .from('study_sessions')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .gte('started_at', startISO)
      .lt('started_at', endISO);
    if (scope) query = query.in('course_id', scope);
    const { data, error } = await query.order('started_at', { ascending: true });
    if (error) throw new Error(`Não foi possível carregar as sessões do dia: ${error.message}`);
    return (data ?? []).map(rowToDomain);
  }

  async listRecent(limit: number): Promise<StudySession[]> {
    const scope = await this.scope();
    if (scope && scope.length === 0) return [];
    let query = this.supabase
      .from('study_sessions')
      .select('*')
      .eq('workspace_id', this.workspaceId);
    if (scope) query = query.in('course_id', scope);
    const { data, error } = await query.order('started_at', { ascending: false }).limit(limit);
    if (error) throw new Error(`Não foi possível carregar as sessões recentes: ${error.message}`);
    return (data ?? []).map(rowToDomain);
  }

  subscribe(listener: () => void): () => void {
    return this.notifier.subscribe(listener);
  }
}

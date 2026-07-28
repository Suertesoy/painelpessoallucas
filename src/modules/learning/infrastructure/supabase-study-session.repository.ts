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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class SupabaseStudySessionRepository implements StudySessionRepository {
  constructor(
    private supabase: SupabaseClient,
    private workspaceId: string,
    private notifier: ChangeNotifier
  ) {}

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
    const { data, error } = await this.supabase
      .from('study_sessions')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('status', 'in_progress')
      .maybeSingle();
    if (error) throw new Error(`Não foi possível verificar a sessão em andamento: ${error.message}`);
    return data ? rowToDomain(data) : null;
  }

  async findByDateRange(startISO: string, endISO: string): Promise<StudySession[]> {
    const { data, error } = await this.supabase
      .from('study_sessions')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .gte('started_at', startISO)
      .lt('started_at', endISO)
      .order('started_at', { ascending: true });
    if (error) throw new Error(`Não foi possível carregar as sessões do dia: ${error.message}`);
    return (data ?? []).map(rowToDomain);
  }

  async listRecent(limit: number): Promise<StudySession[]> {
    const { data, error } = await this.supabase
      .from('study_sessions')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Não foi possível carregar as sessões recentes: ${error.message}`);
    return (data ?? []).map(rowToDomain);
  }

  subscribe(listener: () => void): () => void {
    return this.notifier.subscribe(listener);
  }
}

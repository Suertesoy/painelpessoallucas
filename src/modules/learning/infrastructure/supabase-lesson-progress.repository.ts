'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { LessonProgress, LessonProgressSchema } from '../domain/lesson-progress.schema';
import { LessonProgressRepository } from '../application/lesson-progress.repository';
import { ChangeNotifier } from '@/platform/supabase/change-notifier';

type Row = Record<string, unknown>;

function rowToDomain(row: Row): LessonProgress {
  return LessonProgressSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    courseId: row.course_id,
    moduleId: row.module_id,
    lessonId: row.lesson_id,
    totalExercises: row.total_exercises,
    answeredCount: row.answered_count,
    resolvedCount: row.resolved_count,
    attempts: row.attempts,
    status: row.status,
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class SupabaseLessonProgressRepository implements LessonProgressRepository {
  constructor(
    private supabase: SupabaseClient,
    private workspaceId: string,
    private notifier: ChangeNotifier
  ) {}

  async findByLesson(workspaceId: string, lessonId: string): Promise<LessonProgress | null> {
    const { data, error } = await this.supabase
      .from('learning_lesson_progress')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('lesson_id', lessonId)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível carregar o progresso da lição: ${error.message}`);
    return data ? rowToDomain(data) : null;
  }

  async listByModule(moduleId: string): Promise<LessonProgress[]> {
    const { data, error } = await this.supabase
      .from('learning_lesson_progress')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('module_id', moduleId);
    if (error) throw new Error(`Não foi possível carregar o progresso do módulo: ${error.message}`);
    return (data ?? []).map(rowToDomain);
  }

  async save(progress: LessonProgress): Promise<void> {
    const { error } = await this.supabase.from('learning_lesson_progress').upsert(
      {
        id: progress.id,
        workspace_id: progress.workspaceId,
        course_id: progress.courseId,
        module_id: progress.moduleId,
        lesson_id: progress.lessonId,
        total_exercises: progress.totalExercises,
        answered_count: progress.answeredCount,
        resolved_count: progress.resolvedCount,
        attempts: progress.attempts,
        status: progress.status,
        started_at: progress.startedAt,
        last_activity_at: progress.lastActivityAt,
        completed_at: progress.completedAt ?? null,
        created_at: progress.createdAt,
      },
      { onConflict: 'workspace_id,lesson_id' }
    );
    if (error) throw new Error(`Não foi possível salvar o progresso da lição: ${error.message}`);
    this.notifier.notify();
  }

  subscribe(listener: () => void): () => void {
    return this.notifier.subscribe(listener);
  }
}

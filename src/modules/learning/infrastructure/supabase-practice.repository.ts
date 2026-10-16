'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { PracticeItem, PracticeItemKind, PracticeItemSchema } from '../practice/practice.schema';
import { PracticeItemRepository } from '../application/practice.repository';
import { ChangeNotifier } from '@/platform/supabase/change-notifier';

type Row = Record<string, unknown>;

function rowToDomain(row: Row): PracticeItem {
  return PracticeItemSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    courseId: row.course_id,
    kind: row.kind,
    script: row.script,
    subject: row.subject,
    box: row.box,
    dueOn: row.due_on,
    lastReviewedOn: row.last_reviewed_on ?? undefined,
    attempts: row.attempts,
    correctCount: row.correct_count,
    lapses: row.lapses,
    lastResult: row.last_result ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class SupabasePracticeItemRepository implements PracticeItemRepository {
  constructor(
    private supabase: SupabaseClient,
    private workspaceId: string,
    private notifier: ChangeNotifier
  ) {}

  async listByCourse(courseId: string): Promise<PracticeItem[]> {
    const { data, error } = await this.supabase
      .from('learning_practice_items')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('course_id', courseId);
    if (error) throw new Error(`Não foi possível carregar a prática: ${error.message}`);
    return (data ?? []).map(rowToDomain);
  }

  async findByKey(courseId: string, kind: PracticeItemKind, subject: string): Promise<PracticeItem | null> {
    const { data, error } = await this.supabase
      .from('learning_practice_items')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('course_id', courseId)
      .eq('kind', kind)
      .eq('subject', subject)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível carregar o item de prática: ${error.message}`);
    return data ? rowToDomain(data) : null;
  }

  async save(item: PracticeItem): Promise<void> {
    const { error } = await this.supabase.from('learning_practice_items').upsert(
      {
        id: item.id,
        workspace_id: item.workspaceId,
        course_id: item.courseId,
        kind: item.kind,
        script: item.script,
        subject: item.subject,
        box: item.box,
        due_on: item.dueOn,
        last_reviewed_on: item.lastReviewedOn ?? null,
        attempts: item.attempts,
        correct_count: item.correctCount,
        lapses: item.lapses,
        last_result: item.lastResult ?? null,
        created_at: item.createdAt,
      },
      { onConflict: 'workspace_id,course_id,kind,subject' }
    );
    if (error) throw new Error(`Não foi possível salvar a prática: ${error.message}`);
    this.notifier.notify();
  }

  subscribe(listener: () => void): () => void {
    return this.notifier.subscribe(listener);
  }
}

'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { ItemRepository } from '../application/item.repository';
import { Item, ItemSchema } from '../domain/item.schema';
import { ChangeNotifier } from '@/platform/supabase/change-notifier';

export type ItemRow = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  title: string | null;
  content: string | null;
  type: string;
  status: string;
  priority: string;
  due_at: string | null;
  scheduled_at: string | null;
  estimated_minutes: number | null;
  next_action: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  archived_at: string | null;
  execution_plan_id: string | null;
  plan_phase_id: string | null;
  plan_action_id: string | null;
  recurrence_rule_id: string | null;
  occurrence_at: string | null;
};

export function rowToItem(row: ItemRow): Item {
  return ItemSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id ?? undefined,
    title: row.title ?? undefined,
    content: row.content ?? undefined,
    type: row.type,
    status: row.status,
    priority: row.priority,
    dueAt: row.due_at ?? undefined,
    scheduledAt: row.scheduled_at ?? undefined,
    estimatedMinutes: row.estimated_minutes ?? undefined,
    nextAction: row.next_action ?? undefined,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    executionPlanId: row.execution_plan_id ?? undefined,
    planPhaseId: row.plan_phase_id ?? undefined,
    planActionId: row.plan_action_id ?? undefined,
    recurrenceRuleId: row.recurrence_rule_id ?? undefined,
    occurrenceAt: row.occurrence_at ?? undefined,
  });
}

function itemToRow(item: Item): Omit<ItemRow, 'created_at' | 'updated_at'> & {
  created_at: string;
} {
  return {
    id: item.id,
    workspace_id: item.workspaceId,
    project_id: item.projectId ?? null,
    title: item.title ?? null,
    content: item.content ?? null,
    type: item.type,
    status: item.status,
    priority: item.priority,
    due_at: item.dueAt ?? null,
    scheduled_at: item.scheduledAt ?? null,
    estimated_minutes: item.estimatedMinutes ?? null,
    next_action: item.nextAction ?? null,
    source: item.source,
    created_at: item.createdAt,
    completed_at: item.completedAt ?? null,
    archived_at: item.archivedAt ?? null,
    execution_plan_id: item.executionPlanId ?? null,
    plan_phase_id: item.planPhaseId ?? null,
    plan_action_id: item.planActionId ?? null,
    recurrence_rule_id: item.recurrenceRuleId ?? null,
    occurrence_at: item.occurrenceAt ?? null,
  };
}

export class SupabaseItemRepository implements ItemRepository {
  constructor(
    private supabase: SupabaseClient,
    private workspaceId: string,
    private notifier: ChangeNotifier
  ) {}

  async save(item: Item): Promise<void> {
    const { error } = await this.supabase
      .from('items')
      .upsert(itemToRow(item), { onConflict: 'id' });
    if (error) {
      throw new Error(`Não foi possível salvar o item: ${error.message}`);
    }
    this.notifier.notify();
  }

  async findById(id: string): Promise<Item | null> {
    const { data, error } = await this.supabase
      .from('items')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) {
      throw new Error(`Não foi possível carregar o item: ${error.message}`);
    }
    return data ? rowToItem(data as ItemRow) : null;
  }

  async findAll(): Promise<Item[]> {
    const { data, error } = await this.supabase
      .from('items')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) {
      throw new Error(`Não foi possível carregar os itens: ${error.message}`);
    }
    return (data as ItemRow[]).map(rowToItem);
  }

  async delete(id: string): Promise<void> {
    // Soft delete: preserva o registro para auditoria (deleted_at).
    const { error } = await this.supabase
      .from('items')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      throw new Error(`Não foi possível excluir o item: ${error.message}`);
    }
    this.notifier.notify();
  }

  subscribe(listener: () => void): () => void {
    return this.notifier.subscribe(listener);
  }
}

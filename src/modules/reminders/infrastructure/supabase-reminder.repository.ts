'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { ReminderRepository } from '../application/reminder.repository';
import { Reminder, ReminderSchema } from '../domain/reminder.schema';

interface ReminderRow {
  id: string;
  workspace_id: string;
  item_id: string | null;
  plan_action_id: string | null;
  message: string;
  remind_at: string;
  channel: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function rowToReminder(row: ReminderRow): Reminder {
  return ReminderSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    itemId: row.item_id ?? undefined,
    planActionId: row.plan_action_id ?? undefined,
    message: row.message,
    remindAt: row.remind_at,
    channel: row.channel,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class SupabaseReminderRepository implements ReminderRepository {
  constructor(
    private supabase: SupabaseClient,
    private workspaceId: string
  ) {}

  async findById(id: string): Promise<Reminder | null> {
    const { data, error } = await this.supabase
      .from('reminders')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', this.workspaceId)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível carregar o lembrete: ${error.message}`);
    return data ? rowToReminder(data as ReminderRow) : null;
  }

  async findPendingPushReminderByItem(itemId: string): Promise<Reminder | null> {
    const { data, error } = await this.supabase
      .from('reminders')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('item_id', itemId)
      .eq('channel', 'push')
      .eq('status', 'pending')
      .maybeSingle();
    if (error) throw new Error(`Não foi possível carregar o lembrete: ${error.message}`);
    return data ? rowToReminder(data as ReminderRow) : null;
  }

  async save(reminder: Reminder): Promise<void> {
    const { error } = await this.supabase.from('reminders').upsert(
      {
        id: reminder.id,
        workspace_id: reminder.workspaceId,
        item_id: reminder.itemId ?? null,
        plan_action_id: reminder.planActionId ?? null,
        message: reminder.message,
        remind_at: reminder.remindAt,
        channel: reminder.channel,
        status: reminder.status,
        created_at: reminder.createdAt,
      },
      { onConflict: 'id' }
    );
    if (error) throw new Error(`Não foi possível salvar o lembrete: ${error.message}`);
  }
}

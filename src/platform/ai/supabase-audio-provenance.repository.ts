'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AudioProvenanceRepository,
  AudioTriageRunSummary,
  CalendarEventLinkSummary,
  TriageActionOutcome,
  TriageActionOutcomeStatus,
} from './audio-provenance.repository';
import { AudioTriageProposalSchema } from './audio-triage.schema';

export class SupabaseAudioProvenanceRepository implements AudioProvenanceRepository {
  constructor(
    private supabase: SupabaseClient,
    private workspaceId: string
  ) {}

  async findLatestTriageRun(itemId: string): Promise<AudioTriageRunSummary | null> {
    const { data, error } = await this.supabase
      .from('ai_runs')
      .select('id, model, status, created_at, completed_at, error_message, response_metadata')
      .eq('workspace_id', this.workspaceId)
      .eq('item_id', itemId)
      .in('operation', ['capture_triage', 'audio_capture_triage'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(`Não foi possível carregar o resultado da análise por IA: ${error.message}`);
    }
    if (!data) return null;
    return this.rowToTriageRun(data);
  }

  async findLatestTriageRuns(
    itemIds: string[]
  ): Promise<Record<string, AudioTriageRunSummary>> {
    if (itemIds.length === 0) return {};

    const { data, error } = await this.supabase
      .from('ai_runs')
      .select('id, item_id, model, status, created_at, completed_at, error_message, response_metadata')
      .eq('workspace_id', this.workspaceId)
      .in('item_id', itemIds)
      .in('operation', ['capture_triage', 'audio_capture_triage'])
      .order('created_at', { ascending: false });
    if (error) {
      throw new Error(`Não foi possível carregar os estados das análises: ${error.message}`);
    }

    const latest: Record<string, AudioTriageRunSummary> = {};
    for (const row of data ?? []) {
      if (row.item_id && !latest[row.item_id]) {
        latest[row.item_id] = this.rowToTriageRun(row);
      }
    }
    return latest;
  }

  private rowToTriageRun(data: {
    id: string;
    model: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    created_at: string;
    completed_at: string | null;
    error_message: string | null;
    response_metadata: unknown;
  }): AudioTriageRunSummary {
    const raw = (data.response_metadata ?? {}) as Record<string, unknown>;
    const parsedProposal = AudioTriageProposalSchema.safeParse(raw);
    const actionsOutcome: TriageActionOutcome[] = Array.isArray(raw.actionsOutcome)
      ? (raw.actionsOutcome as TriageActionOutcome[])
      : [];
    const calendarOutcome =
      raw.calendarOutcome === 'done' ||
      raw.calendarOutcome === 'dismissed' ||
      raw.calendarOutcome === 'error'
        ? (raw.calendarOutcome as TriageActionOutcomeStatus)
        : null;

    return {
      id: data.id,
      model: data.model,
      status: data.status,
      createdAt: data.created_at,
      completedAt: data.completed_at,
      errorMessage: data.error_message,
      proposal: parsedProposal.success ? parsedProposal.data : null,
      actionsOutcome,
      calendarOutcome,
    };
  }

  async findCalendarEventLink(itemId: string): Promise<CalendarEventLinkSummary | null> {
    const { data, error } = await this.supabase
      .from('calendar_event_links')
      .select('google_calendar_id, google_event_id, sync_status')
      .eq('workspace_id', this.workspaceId)
      .eq('item_id', itemId)
      .maybeSingle();
    if (error) {
      throw new Error(`Não foi possível carregar o vínculo com o Google Calendar: ${error.message}`);
    }
    if (!data) return null;
    return {
      googleCalendarId: data.google_calendar_id,
      googleEventId: data.google_event_id,
      syncStatus: data.sync_status,
    };
  }

  async recordActionOutcome(aiRunId: string, index: number, status: TriageActionOutcomeStatus): Promise<void> {
    await this.mergeResponseMetadata(aiRunId, (current) => {
      const existing: TriageActionOutcome[] = Array.isArray(current.actionsOutcome)
        ? (current.actionsOutcome as TriageActionOutcome[])
        : [];
      const withoutIndex = existing.filter((o) => o.index !== index);
      return { ...current, actionsOutcome: [...withoutIndex, { index, status }] };
    });
  }

  async recordCalendarOutcome(aiRunId: string, status: TriageActionOutcomeStatus): Promise<void> {
    await this.mergeResponseMetadata(aiRunId, (current) => ({ ...current, calendarOutcome: status }));
  }

  /** auditoria best-effort: falha aqui nunca deve interromper a ação principal do usuário. */
  private async mergeResponseMetadata(
    aiRunId: string,
    patch: (current: Record<string, unknown>) => Record<string, unknown>
  ): Promise<void> {
    try {
      const { data, error: fetchError } = await this.supabase
        .from('ai_runs')
        .select('response_metadata')
        .eq('id', aiRunId)
        .eq('workspace_id', this.workspaceId)
        .maybeSingle();
      if (fetchError || !data) return;
      const current = (data.response_metadata ?? {}) as Record<string, unknown>;
      const { error } = await this.supabase
        .from('ai_runs')
        .update({ response_metadata: patch(current) })
        .eq('id', aiRunId);
      if (error) {
        console.error('Falha ao registrar o resultado da aprovação', error.message);
      }
    } catch (e) {
      console.error('Falha ao registrar o resultado da aprovação', e instanceof Error ? e.message : e);
    }
  }
}

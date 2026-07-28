'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarEventLink, CalendarEventLinkRepository } from './calendar-event-link.repository';
import type { EventModality } from '@/lib/calendar-event-shared';
import { ChangeNotifier } from '@/platform/supabase/change-notifier';

type CalendarEventLinkRow = {
  id: string;
  item_id: string;
  google_calendar_id: string;
  google_event_id: string;
  title: string | null;
  start_at: string | null;
  end_at: string | null;
  time_zone: string;
  location: string | null;
  meeting_link: string | null;
  modality: string;
  html_link: string | null;
  google_status: string | null;
  sync_status: string;
  created_by_panel: boolean;
};

const SELECT_COLUMNS =
  'id, item_id, google_calendar_id, google_event_id, title, start_at, end_at, time_zone, location, meeting_link, modality, html_link, google_status, sync_status, created_by_panel';

function rowToLink(row: CalendarEventLinkRow): CalendarEventLink {
  return {
    id: row.id,
    itemId: row.item_id,
    googleCalendarId: row.google_calendar_id,
    googleEventId: row.google_event_id,
    title: row.title,
    startAt: row.start_at,
    endAt: row.end_at,
    timeZone: row.time_zone,
    location: row.location,
    meetingLink: row.meeting_link,
    modality: (row.modality as EventModality) ?? 'undetermined',
    htmlLink: row.html_link,
    status: row.google_status,
    syncStatus: row.sync_status,
    createdByPanel: row.created_by_panel,
  };
}

export class SupabaseCalendarEventLinkRepository implements CalendarEventLinkRepository {
  constructor(
    private supabase: SupabaseClient,
    private workspaceId: string,
    private notifier: ChangeNotifier
  ) {}

  async listInRange(startIso: string, endIso: string): Promise<CalendarEventLink[]> {
    const { data, error } = await this.supabase
      .from('calendar_event_links')
      .select(SELECT_COLUMNS)
      .eq('workspace_id', this.workspaceId)
      .neq('sync_status', 'deleted')
      .not('start_at', 'is', null)
      .lt('start_at', endIso)
      .gt('end_at', startIso)
      .order('start_at', { ascending: true });
    if (error) {
      throw new Error(`Não foi possível carregar os eventos do calendário: ${error.message}`);
    }
    return (data as CalendarEventLinkRow[]).map(rowToLink);
  }

  subscribe(listener: () => void): () => void {
    return this.notifier.subscribe(listener);
  }

  notifyChanged(): void {
    this.notifier.notify();
  }
}

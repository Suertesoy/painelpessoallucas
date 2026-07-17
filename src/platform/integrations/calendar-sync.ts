import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { getValidAccessToken } from './google-client';
import {
  ensureAppCalendar,
  upsertItemEvent,
  deleteItemEvent,
  type CalendarAccount,
} from './google-calendar';

/**
 * Sincronização item ↔ Google Calendar.
 * O painel é a fonte principal; nada é enviado automaticamente — somente
 * itens com calendar_sync != 'none' (escolha do usuário, por item ou plano).
 */

interface ItemRow {
  id: string;
  workspace_id: string;
  title: string | null;
  content: string | null;
  scheduled_at: string | null;
  estimated_minutes: number | null;
  status: string;
  archived_at: string | null;
  calendar_sync: string;
}

export async function getCalendarAccount(
  db: SupabaseClient,
  workspaceId: string
): Promise<CalendarAccount | null> {
  const { data } = await db
    .from('integration_accounts')
    .select('id, workspace_id, app_calendar_id, status')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'google')
    .eq('service', 'calendar')
    .eq('status', 'connected')
    .maybeSingle();
  return (data as (CalendarAccount & { status: string }) | null) ?? null;
}

/**
 * Sincroniza um item (criar/atualizar/remover o evento conforme o estado).
 * Retorna o status final do vínculo.
 */
export async function syncItemToCalendar(
  admin: SupabaseClient,
  db: SupabaseClient,
  workspaceId: string,
  itemId: string
): Promise<{ status: string; detail?: string }> {
  const account = await getCalendarAccount(db, workspaceId);
  if (!account) {
    return { status: 'skipped', detail: 'Google Calendar não conectado' };
  }

  const { data: item, error: itemError } = await db
    .from('items')
    .select(
      'id, workspace_id, title, content, scheduled_at, estimated_minutes, status, archived_at, calendar_sync'
    )
    .eq('id', itemId)
    .maybeSingle();
  if (itemError || !item) {
    return { status: 'error', detail: 'Item não encontrado' };
  }
  const typedItem = item as ItemRow;

  const { data: link } = await db
    .from('calendar_event_links')
    .select('*')
    .eq('item_id', itemId)
    .maybeSingle();

  const accessToken = await getValidAccessToken(admin, account.id);
  const calendarId = await ensureAppCalendar(admin, account, accessToken);

  const shouldRemove =
    typedItem.calendar_sync === 'none' ||
    typedItem.archived_at != null ||
    typedItem.status === 'archived' ||
    !typedItem.scheduled_at;

  try {
    if (shouldRemove) {
      if (link && link.sync_status !== 'deleted') {
        await deleteItemEvent(accessToken, link.google_calendar_id, link.google_event_id);
        await db
          .from('calendar_event_links')
          .update({ sync_status: 'deleted', last_synced_at: new Date().toISOString(), last_error: null })
          .eq('id', link.id);
      }
      return { status: 'removed' };
    }

    const startIso = typedItem.scheduled_at!;
    const durationMin = typedItem.estimated_minutes ?? 30;
    const endIso = new Date(new Date(startIso).getTime() + durationMin * 60000).toISOString();

    const event = await upsertItemEvent(
      accessToken,
      calendarId,
      {
        itemId: typedItem.id,
        title: typedItem.title ?? typedItem.content?.slice(0, 80) ?? 'Item do painel',
        description: typedItem.content ?? undefined,
        startIso,
        endIso,
        withReminder: typedItem.calendar_sync === 'sync_reminder',
      },
      link?.sync_status !== 'deleted' ? link?.google_event_id : undefined
    );

    await db.from('calendar_event_links').upsert(
      {
        workspace_id: workspaceId,
        item_id: typedItem.id,
        google_calendar_id: calendarId,
        google_event_id: event.id,
        etag: event.etag,
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: 'item_id' }
    );
    return { status: 'synced' };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'erro desconhecido';
    await db.from('calendar_event_links').upsert(
      {
        workspace_id: workspaceId,
        item_id: typedItem.id,
        google_calendar_id: link?.google_calendar_id ?? calendarId,
        google_event_id: link?.google_event_id ?? 'pending',
        sync_status: 'error',
        last_error: message.slice(0, 300),
      },
      { onConflict: 'item_id' }
    );
    return { status: 'error', detail: message };
  }
}

/** Reprocessa vínculos pendentes/com erro (usado pelo cron). */
export async function syncPendingCalendarLinks(
  admin: SupabaseClient,
  db: SupabaseClient,
  workspaceId: string,
  limit = 20
): Promise<{ synced: number; errors: number }> {
  const { data: links } = await db
    .from('calendar_event_links')
    .select('item_id')
    .eq('workspace_id', workspaceId)
    .in('sync_status', ['pending', 'error'])
    .limit(limit);

  let synced = 0;
  let errors = 0;
  for (const link of links ?? []) {
    const result = await syncItemToCalendar(admin, db, workspaceId, link.item_id);
    if (result.status === 'error') errors += 1;
    else synced += 1;
  }
  return { synced, errors };
}

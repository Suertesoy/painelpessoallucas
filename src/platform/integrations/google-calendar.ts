import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { googleApiFetch } from './google-client';

/**
 * Serviço do Google Calendar (scopes mínimos):
 * - calendar.app.created: criar/administrar o calendário secundário da app.
 * - calendar.freebusy: consultar disponibilidade (sem ler eventos alheios).
 *
 * O painel é a fonte principal. Eventos criados aqui recebem
 * extendedProperties.private.painelItemId para evitar loops de sincronização.
 */

const CAL_API = 'https://www.googleapis.com/calendar/v3';
export const APP_CALENDAR_NAME = 'Painel Lucas';

export interface CalendarAccount {
  id: string;
  workspace_id: string;
  app_calendar_id: string | null;
}

/** Garante o calendário "Painel Lucas" (cria uma única vez; reutiliza depois). */
export async function ensureAppCalendar(
  admin: SupabaseClient,
  account: CalendarAccount,
  accessToken: string
): Promise<string> {
  if (account.app_calendar_id) {
    // Verifica se ainda existe (pode ter sido apagado manualmente).
    const check = await googleApiFetch(
      accessToken,
      `${CAL_API}/calendars/${encodeURIComponent(account.app_calendar_id)}`
    );
    if (check.ok) return account.app_calendar_id;
  }

  const res = await googleApiFetch(accessToken, `${CAL_API}/calendars`, {
    method: 'POST',
    body: JSON.stringify({
      summary: APP_CALENDAR_NAME,
      timeZone: 'America/Sao_Paulo',
    }),
  });
  if (!res.ok) {
    throw new Error(`Falha ao criar o calendário "${APP_CALENDAR_NAME}" (HTTP ${res.status})`);
  }
  const calendar = (await res.json()) as { id: string };

  const { error } = await admin
    .from('integration_accounts')
    .update({ app_calendar_id: calendar.id })
    .eq('id', account.id);
  if (error) throw new Error(`Falha ao registrar o calendário: ${error.message}`);

  return calendar.id;
}

export interface BusyBlock {
  start: string;
  end: string;
}

/** Blocos ocupados (freebusy) do calendário principal + calendário da app. */
export async function queryFreeBusy(
  accessToken: string,
  calendarIds: string[],
  timeMinIso: string,
  timeMaxIso: string
): Promise<Record<string, BusyBlock[]>> {
  const res = await googleApiFetch(accessToken, `${CAL_API}/freeBusy`, {
    method: 'POST',
    body: JSON.stringify({
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      timeZone: 'America/Sao_Paulo',
      items: calendarIds.map((id) => ({ id })),
    }),
  });
  if (!res.ok) {
    throw new Error(`Consulta de disponibilidade falhou (HTTP ${res.status})`);
  }
  const json = (await res.json()) as {
    calendars: Record<string, { busy: BusyBlock[] }>;
  };
  const result: Record<string, BusyBlock[]> = {};
  for (const [id, value] of Object.entries(json.calendars ?? {})) {
    result[id] = value.busy ?? [];
  }
  return result;
}

export interface PainelEventInput {
  itemId: string;
  title: string;
  description?: string;
  startIso: string;
  endIso: string;
  withReminder: boolean;
}

interface GoogleEvent {
  id: string;
  etag: string;
}

/** Cria ou atualiza o evento do item no calendário da app. */
export async function upsertItemEvent(
  accessToken: string,
  calendarId: string,
  input: PainelEventInput,
  existingEventId?: string
): Promise<GoogleEvent> {
  const body = JSON.stringify({
    summary: input.title,
    description: input.description ?? '',
    start: { dateTime: input.startIso, timeZone: 'America/Sao_Paulo' },
    end: { dateTime: input.endIso, timeZone: 'America/Sao_Paulo' },
    reminders: input.withReminder
      ? { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] }
      : { useDefault: false, overrides: [] },
    // Identificação anti-loop: eventos do painel são reconhecíveis.
    extendedProperties: { private: { painel: '1', painelItemId: input.itemId } },
  });

  const url = existingEventId
    ? `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingEventId)}`
    : `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events`;

  const res = await googleApiFetch(accessToken, url, {
    method: existingEventId ? 'PUT' : 'POST',
    body,
  });
  if (res.status === 404 && existingEventId) {
    // Evento apagado no Google: recria.
    return upsertItemEvent(accessToken, calendarId, input);
  }
  if (!res.ok) {
    throw new Error(`Falha ao sincronizar evento (HTTP ${res.status})`);
  }
  const event = (await res.json()) as GoogleEvent;
  return event;
}

export async function deleteItemEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const res = await googleApiFetch(
    accessToken,
    `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' }
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Falha ao remover evento (HTTP ${res.status})`);
  }
}

/** Eventos do calendário da app em uma janela (para a tela Hoje). */
export async function listAppCalendarEvents(
  accessToken: string,
  calendarId: string,
  timeMinIso: string,
  timeMaxIso: string
): Promise<{ id: string; summary: string; start?: string; end?: string; painelItemId?: string }[]> {
  const params = new URLSearchParams({
    timeMin: timeMinIso,
    timeMax: timeMaxIso,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  });
  const res = await googleApiFetch(
    accessToken,
    `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`
  );
  if (!res.ok) {
    throw new Error(`Falha ao listar eventos (HTTP ${res.status})`);
  }
  const json = (await res.json()) as {
    items?: {
      id: string;
      summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      extendedProperties?: { private?: Record<string, string> };
    }[];
  };
  return (json.items ?? []).map((e) => ({
    id: e.id,
    summary: e.summary ?? '(sem título)',
    start: e.start?.dateTime ?? e.start?.date,
    end: e.end?.dateTime ?? e.end?.date,
    painelItemId: e.extendedProperties?.private?.painelItemId,
  }));
}

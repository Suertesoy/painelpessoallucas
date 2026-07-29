/**
 * Regra de não duplicidade com o Google Calendar (pura, sem I/O).
 *
 * Um lembrete push só é considerado "já coberto" pelo Google Calendar quando
 * o evento realmente foi confirmado por lá (sync_status = 'synced') E o
 * usuário pediu explicitamente lembrete nativo do Google para aquele item
 * (calendar_sync = 'sync_reminder') E o evento tem pelo menos um minuto de
 * lembrete configurado (reminders_minutes não vazio — é o que
 * upsertItemEvent() envia ao Google quando sync_reminder está ativo).
 *
 * Qualquer outro estado (pending/error/deleted, calendar_sync = 'sync' sem
 * lembrete, ou ausência de vínculo) significa que o Google não está de fato
 * avisando o usuário sobre este item — o push deve ser permitido como
 * garantia de que o aviso chega de algum jeito.
 */

export type ItemCalendarSync = 'none' | 'sync' | 'sync_reminder';
export type CalendarLinkSyncStatus = 'pending' | 'synced' | 'error' | 'deleted';

export interface CalendarCoverageInput {
  calendarSync: ItemCalendarSync;
  link: {
    syncStatus: CalendarLinkSyncStatus;
    remindersMinutes: number[];
  } | null;
}

export function isCoveredByGoogleCalendarReminder(input: CalendarCoverageInput): boolean {
  if (input.calendarSync !== 'sync_reminder') return false;
  if (!input.link) return false;
  if (input.link.syncStatus !== 'synced') return false;
  return input.link.remindersMinutes.length > 0;
}

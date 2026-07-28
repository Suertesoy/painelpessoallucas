import type { EventModality } from '@/lib/calendar-event-shared';

/**
 * Representação normalizada de um evento vinculado a uma captura — a mesma
 * forma que, na fase futura de sincronização bidirecional, também vai
 * representar eventos lidos diretamente do Google (createdByPanel: false).
 */
export interface CalendarEventLink {
  id: string;
  itemId: string;
  googleCalendarId: string;
  googleEventId: string;
  title: string | null;
  startAt: string | null;
  endAt: string | null;
  timeZone: string;
  location: string | null;
  meetingLink: string | null;
  modality: EventModality;
  htmlLink: string | null;
  status: string | null;
  syncStatus: string;
  createdByPanel: boolean;
}

export interface CalendarEventLinkRepository {
  /** Eventos cujo intervalo cruza [startIso, endIso). */
  listInRange(startIso: string, endIso: string): Promise<CalendarEventLink[]>;
  subscribe(listener: () => void): () => void;
  /**
   * A criação do evento acontece numa rota de servidor (não por este
   * repositório) — depois de confirmar sucesso, o cliente chama isto para
   * avisar as queries reativas (agenda, Hoje) de que há dado novo.
   */
  notifyChanged(): void;
}

/**
 * Seleção do próximo compromisso do calendário (card compacto da Home).
 *
 * Reaproveita exatamente os dados já lidos por `/api/integrations/calendar/today`
 * (events do calendário "Painel Lucas" + busy blocks do calendário principal).
 * Não lê títulos de eventos externos — escopo mínimo do Google Calendar
 * preservado deliberadamente (ver `src/platform/integrations/google-calendar.ts`).
 * Por isso um compromisso externo aparece sem título ("Compromisso").
 */

export interface CalendarEventLike {
  id: string;
  summary: string;
  start?: string;
}

export interface BusyBlockLike {
  start: string;
  end: string;
}

export interface NextEvent {
  id: string;
  label: string;
  hasTitle: boolean;
  startIso: string;
}

export function selectNextEvent(
  events: CalendarEventLike[],
  busy: BusyBlockLike[],
  nowIso: string
): NextEvent | null {
  const now = new Date(nowIso).getTime();
  const candidates: NextEvent[] = [];

  for (const e of events) {
    if (!e.start) continue;
    if (new Date(e.start).getTime() <= now) continue;
    candidates.push({ id: e.id, label: e.summary, hasTitle: true, startIso: e.start });
  }
  for (const b of busy) {
    if (new Date(b.start).getTime() <= now) continue;
    candidates.push({ id: `busy-${b.start}`, label: 'Compromisso', hasTitle: false, startIso: b.start });
  }

  candidates.sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime());
  return candidates[0] ?? null;
}

import type { CalendarEventLink, CalendarEventLinkRepository } from './calendar-event-link.repository';

export class CalendarEventQueries {
  constructor(private repo: CalendarEventLinkRepository) {}

  async listInRange(startIso: string, endIso: string): Promise<CalendarEventLink[]> {
    return this.repo.listInRange(startIso, endIso);
  }
}

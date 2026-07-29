import { describe, it, expect } from 'vitest';
import { isCoveredByGoogleCalendarReminder } from '@/platform/push/calendar-coverage';

describe('isCoveredByGoogleCalendarReminder', () => {
  it('cobre quando sync_reminder + synced + lembretes configurados', () => {
    expect(
      isCoveredByGoogleCalendarReminder({
        calendarSync: 'sync_reminder',
        link: { syncStatus: 'synced', remindersMinutes: [15] },
      })
    ).toBe(true);
  });

  it('não cobre quando não há vínculo', () => {
    expect(isCoveredByGoogleCalendarReminder({ calendarSync: 'sync_reminder', link: null })).toBe(false);
  });

  it('não cobre quando calendar_sync é "none"', () => {
    expect(
      isCoveredByGoogleCalendarReminder({
        calendarSync: 'none',
        link: { syncStatus: 'synced', remindersMinutes: [15] },
      })
    ).toBe(false);
  });

  it('não cobre quando calendar_sync é "sync" sem lembrete nativo', () => {
    expect(
      isCoveredByGoogleCalendarReminder({
        calendarSync: 'sync',
        link: { syncStatus: 'synced', remindersMinutes: [] },
      })
    ).toBe(false);
  });

  it('não cobre quando o vínculo está "pending" (Google ainda não confirmou)', () => {
    expect(
      isCoveredByGoogleCalendarReminder({
        calendarSync: 'sync_reminder',
        link: { syncStatus: 'pending', remindersMinutes: [15] },
      })
    ).toBe(false);
  });

  it('não cobre quando o vínculo está em "error"', () => {
    expect(
      isCoveredByGoogleCalendarReminder({
        calendarSync: 'sync_reminder',
        link: { syncStatus: 'error', remindersMinutes: [15] },
      })
    ).toBe(false);
  });

  it('não cobre quando o vínculo foi "deleted"', () => {
    expect(
      isCoveredByGoogleCalendarReminder({
        calendarSync: 'sync_reminder',
        link: { syncStatus: 'deleted', remindersMinutes: [15] },
      })
    ).toBe(false);
  });

  it('não cobre quando sync_reminder + synced mas sem minutos de lembrete', () => {
    expect(
      isCoveredByGoogleCalendarReminder({
        calendarSync: 'sync_reminder',
        link: { syncStatus: 'synced', remindersMinutes: [] },
      })
    ).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import {
  validateEventInterval,
  computeActiveReminders,
  isValidMeetingLink,
  addMinutesIso,
  diffMinutes,
  INVALID_INTERVAL_MESSAGE,
} from '@/lib/calendar-event-shared';

describe('validateEventInterval', () => {
  it('rejeita término anterior ao início com a mensagem exigida', () => {
    const result = validateEventInterval('2026-08-01T11:00:00-03:00', '2026-08-01T10:00:00-03:00');
    expect(result.valid).toBe(false);
    expect(result.message).toBe(INVALID_INTERVAL_MESSAGE);
    expect(result.message).not.toMatch(/HTTP|400/);
  });

  it('rejeita término igual ao início', () => {
    const result = validateEventInterval('2026-08-01T10:00:00-03:00', '2026-08-01T10:00:00-03:00');
    expect(result.valid).toBe(false);
    expect(result.message).toBe(INVALID_INTERVAL_MESSAGE);
  });

  it('aceita término posterior ao início', () => {
    const result = validateEventInterval('2026-08-01T10:00:00-03:00', '2026-08-01T11:00:00-03:00');
    expect(result.valid).toBe(true);
  });

  it('rejeita quando falta início ou término', () => {
    expect(validateEventInterval(undefined, '2026-08-01T11:00:00-03:00').valid).toBe(false);
    expect(validateEventInterval('2026-08-01T10:00:00-03:00', undefined).valid).toBe(false);
  });
});

describe('addMinutesIso / diffMinutes', () => {
  it('soma minutos preservando o instante', () => {
    const end = addMinutesIso('2026-08-01T10:00:00.000Z', 60);
    expect(diffMinutes('2026-08-01T10:00:00.000Z', end)).toBe(60);
  });
});

describe('computeActiveReminders', () => {
  const now = '2026-08-01T10:00:00.000Z';

  it('mantém todos os lembretes quando o evento está longe no futuro', () => {
    const start = '2026-08-05T10:00:00.000Z';
    const result = computeActiveReminders(start, [1440, 60], now);
    expect(result.minutes).toEqual([1440, 60]);
    expect(result.notice).toBeNull();
  });

  it('remove o aviso de 1 dia mas preserva o de 1 hora quando o evento é em menos de 24h', () => {
    const start = '2026-08-01T11:30:00.000Z'; // 90 min à frente
    const result = computeActiveReminders(start, [1440, 60], now);
    expect(result.minutes).toEqual([60]);
    expect(result.notice).toBe('O horário do primeiro aviso já passou. O aviso de uma hora continua ativo.');
  });

  it('informa que os avisos prévios já passaram quando faltar menos de 1h, sem impedir a criação', () => {
    const start = '2026-08-01T10:30:00.000Z'; // 30 min à frente
    const result = computeActiveReminders(start, [1440, 60], now);
    expect(result.minutes).toEqual([]);
    expect(result.notice).toBe('Os avisos prévios já passaram — o evento será criado sem lembretes.');
  });
});

describe('isValidMeetingLink', () => {
  it('aceita links https válidos (Meet, Teams, Zoom, outros)', () => {
    expect(isValidMeetingLink('https://meet.google.com/abc-defg-hij')).toBe(true);
    expect(isValidMeetingLink('https://teams.microsoft.com/l/meetup-join/x')).toBe(true);
    expect(isValidMeetingLink('https://zoom.us/j/123456789')).toBe(true);
    expect(isValidMeetingLink('https://empresa.com/sala-1')).toBe(true);
  });

  it('rejeita links não-https ou inválidos', () => {
    expect(isValidMeetingLink('http://meet.google.com/abc')).toBe(false);
    expect(isValidMeetingLink('não é um link')).toBe(false);
    expect(isValidMeetingLink('')).toBe(false);
  });
});

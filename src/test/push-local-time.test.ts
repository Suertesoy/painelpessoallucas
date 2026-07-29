import { describe, it, expect } from 'vitest';
import { localDateTimeParts, timeToMinutes, fiveMinuteBucketKey } from '@/platform/push/local-time';

describe('localDateTimeParts', () => {
  it('calcula corretamente para America/Sao_Paulo (UTC-3)', () => {
    // 2026-07-29T10:00:00Z → 07:00 em São Paulo, quarta-feira.
    const parts = localDateTimeParts(new Date('2026-07-29T10:00:00.000Z'), 'America/Sao_Paulo');
    expect(parts).toEqual({ date: '2026-07-29', hour: 7, minute: 0, dow: 3 });
  });

  it('domingo é dow=0', () => {
    // 2026-08-02 é um domingo.
    const parts = localDateTimeParts(new Date('2026-08-02T15:00:00.000Z'), 'America/Sao_Paulo');
    expect(parts.dow).toBe(0);
  });

  it('mudança de mês: 31/07 23:30 UTC-3 vira 01/08 no fuso local', () => {
    // 2026-08-01T02:30:00Z = 2026-07-31T23:30:00-03:00
    const parts = localDateTimeParts(new Date('2026-08-01T02:30:00.000Z'), 'America/Sao_Paulo');
    expect(parts.date).toBe('2026-07-31');
  });

  it('mudança de ano: 31/12 23:00 UTC-3 permanece no ano anterior', () => {
    const parts = localDateTimeParts(new Date('2027-01-01T01:00:00.000Z'), 'America/Sao_Paulo');
    expect(parts.date).toBe('2026-12-31');
  });

  it('fuso diferente (Europe/Paris, UTC+1 no inverno) calcula corretamente', () => {
    const parts = localDateTimeParts(new Date('2026-01-15T23:30:00.000Z'), 'Europe/Paris');
    expect(parts.date).toBe('2026-01-16');
    expect(parts.hour).toBe(0);
    expect(parts.minute).toBe(30);
  });

  it('fuso com meio-fuso (Asia/Kolkata, UTC+5:30)', () => {
    const parts = localDateTimeParts(new Date('2026-07-29T18:45:00.000Z'), 'Asia/Kolkata');
    expect(parts.hour).toBe(0);
    expect(parts.minute).toBe(15);
    expect(parts.date).toBe('2026-07-30');
  });
});

describe('timeToMinutes', () => {
  it('converte HH:mm em minutos desde meia-noite', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('08:00')).toBe(480);
    expect(timeToMinutes('23:59')).toBe(1439);
  });
});

describe('fiveMinuteBucketKey', () => {
  it('agrupa horários no mesmo bloco de 5 minutos', () => {
    const a = fiveMinuteBucketKey(new Date('2026-07-29T14:07:12.000Z'));
    const b = fiveMinuteBucketKey(new Date('2026-07-29T14:09:59.000Z'));
    expect(a).toBe(b);
  });

  it('blocos diferentes de 5 minutos geram chaves diferentes (não usa a chave horária)', () => {
    const a = fiveMinuteBucketKey(new Date('2026-07-29T14:07:00.000Z'));
    const b = fiveMinuteBucketKey(new Date('2026-07-29T14:22:00.000Z'));
    expect(a).not.toBe(b);
  });

  it('a virada de hora produz um novo bloco', () => {
    const a = fiveMinuteBucketKey(new Date('2026-07-29T14:59:00.000Z'));
    const b = fiveMinuteBucketKey(new Date('2026-07-29T15:00:00.000Z'));
    expect(a).not.toBe(b);
  });
});

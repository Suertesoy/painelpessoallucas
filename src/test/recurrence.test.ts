import { describe, it, expect } from 'vitest';
import {
  occurrenceDatesBetween,
  occurrencesBetween,
  nextOccurrenceAfter,
  zonedDateTimeToUtc,
  utcToZonedDateStr,
  addDaysToDateStr,
  type RecurrenceSpec,
} from '@/modules/plans/domain/recurrence-engine';

const TZ = 'America/Sao_Paulo';

const base = (over: Partial<RecurrenceSpec>): RecurrenceSpec => ({
  frequency: 'daily',
  interval: 1,
  timezone: TZ,
  localTime: '08:00',
  startAt: zonedDateTimeToUtc('2026-08-03', '08:00', TZ).toISOString(),
  ...over,
});

describe('Timezone America/Sao_Paulo', () => {
  it('converte horário local de SP (-03:00) para UTC corretamente', () => {
    const utc = zonedDateTimeToUtc('2026-08-03', '08:00', TZ);
    expect(utc.toISOString()).toBe('2026-08-03T11:00:00.000Z');
  });

  it('mantém o dia local mesmo à noite (quando o dia UTC já virou)', () => {
    const utc = zonedDateTimeToUtc('2026-08-03', '22:30', TZ);
    expect(utc.toISOString()).toBe('2026-08-04T01:30:00.000Z');
    expect(utcToZonedDateStr(utc, TZ)).toBe('2026-08-03');
  });

  it('soma dias em datas locais sem deslocamento de fuso', () => {
    expect(addDaysToDateStr('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDaysToDateStr('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('Geração determinística de ocorrências', () => {
  it('daily: gera todos os dias no intervalo', () => {
    const dates = occurrenceDatesBetween(
      { frequency: 'daily', interval: 1, timezone: TZ },
      '2026-08-03',
      '2026-08-03',
      '2026-08-07'
    );
    expect(dates).toEqual(['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07']);
  });

  it('daily com interval 2: dia sim, dia não, alinhado à âncora', () => {
    const dates = occurrenceDatesBetween(
      { frequency: 'daily', interval: 2, timezone: TZ },
      '2026-08-03',
      '2026-08-04',
      '2026-08-09'
    );
    expect(dates).toEqual(['2026-08-05', '2026-08-07', '2026-08-09']);
  });

  it('weekly: respeita days_of_week (seg=1, sex=5)', () => {
    const dates = occurrenceDatesBetween(
      { frequency: 'weekly', interval: 1, daysOfWeek: [1, 5], timezone: TZ },
      '2026-08-03', // segunda
      '2026-08-03',
      '2026-08-14'
    );
    expect(dates).toEqual(['2026-08-03', '2026-08-07', '2026-08-10', '2026-08-14']);
  });

  it('monthly: clampa dia 31 em meses curtos', () => {
    const dates = occurrenceDatesBetween(
      { frequency: 'monthly', interval: 1, dayOfMonth: 31, timezone: TZ },
      '2026-01-31',
      '2026-01-01',
      '2026-04-30'
    );
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('once: uma única ocorrência na âncora', () => {
    const dates = occurrenceDatesBetween(
      { frequency: 'once', interval: 1, timezone: TZ },
      '2026-08-10',
      '2026-08-01',
      '2026-08-31'
    );
    expect(dates).toEqual(['2026-08-10']);
  });

  it('é determinístico: mesmas entradas, mesmas saídas', () => {
    const spec = base({ frequency: 'weekly', daysOfWeek: [2, 4] });
    const from = new Date('2026-08-01T00:00:00Z');
    const to = new Date('2026-08-31T23:59:59Z');
    const a = occurrencesBetween(spec, from, to);
    const b = occurrencesBetween(spec, from, to);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });
});

describe('Limites de recorrência', () => {
  it('respeita end_at', () => {
    const spec = base({
      endAt: zonedDateTimeToUtc('2026-08-05', '08:00', TZ).toISOString(),
    });
    const occ = occurrencesBetween(
      spec,
      new Date('2026-08-01T00:00:00Z'),
      new Date('2026-08-31T23:59:59Z')
    );
    expect(occ.map((o) => o.localDate)).toEqual(['2026-08-03', '2026-08-04', '2026-08-05']);
  });

  it('respeita max_occurrences descontando as já geradas', () => {
    const spec = base({ maxOccurrences: 5 });
    const occ = occurrencesBetween(
      spec,
      new Date('2026-08-01T00:00:00Z'),
      new Date('2026-08-31T23:59:59Z'),
      3 // já existem 3
    );
    expect(occ).toHaveLength(2);
  });

  it('não gera nada antes da âncora (start_at)', () => {
    const spec = base({});
    const occ = occurrencesBetween(
      spec,
      new Date('2026-07-01T00:00:00Z'),
      new Date('2026-08-02T23:59:59Z')
    );
    expect(occ).toHaveLength(0);
  });

  it('sem start_at não gera ocorrências (regra não ativada)', () => {
    const spec = base({ startAt: undefined });
    const occ = occurrencesBetween(
      spec,
      new Date('2026-08-01T00:00:00Z'),
      new Date('2026-08-31T23:59:59Z')
    );
    expect(occ).toHaveLength(0);
  });
});

describe('Próxima ocorrência (next_occurrence_at)', () => {
  it('encontra a próxima ocorrência após um instante', () => {
    const spec = base({ frequency: 'weekly', daysOfWeek: [1] }); // segundas
    const next = nextOccurrenceAfter(spec, new Date('2026-08-04T00:00:00Z'));
    expect(next).toBe(zonedDateTimeToUtc('2026-08-10', '08:00', TZ).toISOString());
  });

  it('retorna null quando a regra terminou', () => {
    const spec = base({
      endAt: zonedDateTimeToUtc('2026-08-05', '08:00', TZ).toISOString(),
    });
    const next = nextOccurrenceAfter(spec, new Date('2026-08-06T00:00:00Z'));
    expect(next).toBeNull();
  });

  it('chave única da ocorrência é o instante UTC exato (idempotência)', () => {
    const spec = base({});
    const occA = occurrencesBetween(
      spec,
      new Date('2026-08-03T00:00:00Z'),
      new Date('2026-08-03T23:59:59Z')
    );
    const occB = occurrencesBetween(
      spec,
      new Date('2026-08-02T12:00:00Z'),
      new Date('2026-08-04T12:00:00Z')
    );
    // A mesma ocorrência aparece com o mesmo occurrenceAt em janelas diferentes
    expect(occA[0].occurrenceAt).toBe('2026-08-03T11:00:00.000Z');
    expect(occB.map((o) => o.occurrenceAt)).toContain(occA[0].occurrenceAt);
  });
});

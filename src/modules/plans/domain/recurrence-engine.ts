/**
 * Motor determinístico de recorrências.
 *
 * Funções puras: mesmos parâmetros → mesmas ocorrências, sempre. Sem acesso a
 * banco, rede ou relógio (o "agora" é parâmetro). Timezone padrão do usuário:
 * America/Sao_Paulo — horários locais são convertidos para instantes UTC.
 */

export interface RecurrenceSpec {
  frequency:
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'once'
    | 'relative_to_plan_start'
    | 'relative_to_phase_start'
    | 'relative_to_event';
  interval: number;
  daysOfWeek?: number[]; // 0=domingo … 6=sábado
  dayOfMonth?: number;
  localTime?: string; // HH:MM ou HH:MM:SS
  timezone: string;
  startAt?: string; // ISO — âncora (já resolvida para regras relativas)
  endAt?: string;   // ISO — limite superior (inclusive)
  maxOccurrences?: number;
}

// ---------------------------------------------------------------------------
// Timezone: conversão dia local + horário local → instante UTC
// ---------------------------------------------------------------------------

function tzOffsetMinutes(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUtc - instant.getTime()) / 60000;
}

/** Converte (YYYY-MM-DD, HH:MM, timezone) no instante UTC correspondente. */
export function zonedDateTimeToUtc(date: string, time: string, timeZone: string): Date {
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  const utcGuess = new Date(`${date}T${normalizedTime}Z`);
  const offset1 = tzOffsetMinutes(utcGuess, timeZone);
  let result = new Date(utcGuess.getTime() - offset1 * 60000);
  const offset2 = tzOffsetMinutes(result, timeZone);
  if (offset2 !== offset1) {
    result = new Date(utcGuess.getTime() - offset2 * 60000);
  }
  return result;
}

/** Dia local (YYYY-MM-DD) de um instante UTC em um timezone. */
export function utcToZonedDateStr(instant: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return dtf.format(instant); // en-CA → YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// Aritmética de datas locais (strings YYYY-MM-DD, sem Date para evitar UTC)
// ---------------------------------------------------------------------------

function dateStrToOrdinal(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function ordinalToDateStr(ordinal: number): string {
  return new Date(ordinal * 86_400_000).toISOString().slice(0, 10);
}

export function addDaysToDateStr(date: string, days: number): string {
  return ordinalToDateStr(dateStrToOrdinal(date) + days);
}

function dayOfWeekOf(date: string): number {
  // ordinal 0 = 1970-01-01 (quinta = 4)
  return (((dateStrToOrdinal(date) + 4) % 7) + 7) % 7;
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

// ---------------------------------------------------------------------------
// Geração de ocorrências
// ---------------------------------------------------------------------------

const HORIZON_SAFETY_LIMIT = 1000;

/**
 * Gera as datas locais (YYYY-MM-DD) das ocorrências no intervalo
 * [fromDate, toDate] (inclusive), respeitando âncora e frequência.
 */
export function occurrenceDatesBetween(
  spec: RecurrenceSpec,
  anchorDate: string,
  fromDate: string,
  toDate: string
): string[] {
  if (dateStrToOrdinal(toDate) < dateStrToOrdinal(fromDate)) return [];

  const results: string[] = [];
  const fromOrd = dateStrToOrdinal(fromDate);
  const toOrd = dateStrToOrdinal(toDate);
  const anchorOrd = dateStrToOrdinal(anchorDate);

  switch (spec.frequency) {
    case 'once':
    case 'relative_to_plan_start':
    case 'relative_to_phase_start':
    case 'relative_to_event': {
      // Ocorrência única na âncora (regras relativas são resolvidas na
      // ativação: a âncora já embute o offset).
      if (anchorOrd >= fromOrd && anchorOrd <= toOrd) results.push(anchorDate);
      break;
    }

    case 'daily': {
      const step = Math.max(1, spec.interval);
      // primeira ocorrência >= fromDate alinhada à âncora
      let ord = anchorOrd;
      if (ord < fromOrd) {
        const diff = fromOrd - ord;
        ord += Math.ceil(diff / step) * step;
      }
      let guard = 0;
      while (ord <= toOrd && guard++ < HORIZON_SAFETY_LIMIT) {
        results.push(ordinalToDateStr(ord));
        ord += step;
      }
      break;
    }

    case 'weekly': {
      const step = Math.max(1, spec.interval);
      const days = (spec.daysOfWeek && spec.daysOfWeek.length > 0
        ? [...spec.daysOfWeek]
        : [dayOfWeekOf(anchorDate)]
      ).sort((a, b) => a - b);
      // semana da âncora começa no domingo
      const anchorWeekStart = anchorOrd - dayOfWeekOf(anchorDate);
      let guard = 0;
      for (
        let weekStart = anchorWeekStart;
        weekStart <= toOrd && guard++ < HORIZON_SAFETY_LIMIT;
        weekStart += 7 * step
      ) {
        for (const dow of days) {
          const ord = weekStart + dow;
          if (ord >= anchorOrd && ord >= fromOrd && ord <= toOrd) {
            results.push(ordinalToDateStr(ord));
          }
        }
      }
      break;
    }

    case 'monthly': {
      const step = Math.max(1, spec.interval);
      const [anchorYear, anchorMonth] = anchorDate.split('-').map(Number);
      const targetDay = spec.dayOfMonth ?? Number(anchorDate.slice(8, 10));
      let guard = 0;
      for (let i = 0; guard++ < HORIZON_SAFETY_LIMIT; i += step) {
        const totalMonths = anchorMonth - 1 + i;
        const year = anchorYear + Math.floor(totalMonths / 12);
        const month = (totalMonths % 12) + 1;
        const day = Math.min(targetDay, daysInMonth(year, month));
        const dateStr = `${year.toString().padStart(4, '0')}-${month
          .toString()
          .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        const ord = dateStrToOrdinal(dateStr);
        if (ord > toOrd) break;
        if (ord >= anchorOrd && ord >= fromOrd) results.push(dateStr);
      }
      break;
    }
  }

  return results;
}

export interface Occurrence {
  /** Instante UTC (ISO) da ocorrência — chave única junto com a regra. */
  occurrenceAt: string;
  /** Dia local correspondente. */
  localDate: string;
}

/**
 * Ocorrências (instantes UTC) no intervalo [fromUtc, toUtc], respeitando
 * endAt e maxOccurrences (contando as já geradas anteriormente).
 */
export function occurrencesBetween(
  spec: RecurrenceSpec,
  fromUtc: Date,
  toUtc: Date,
  alreadyGenerated = 0
): Occurrence[] {
  if (!spec.startAt) return [];

  const anchorLocal = utcToZonedDateStr(new Date(spec.startAt), spec.timezone);
  const time = spec.localTime ?? '09:00';

  // margem de 1 dia nas bordas locais para não perder ocorrências no fuso
  const fromLocal = addDaysToDateStr(utcToZonedDateStr(fromUtc, spec.timezone), -1);
  const toLocal = addDaysToDateStr(utcToZonedDateStr(toUtc, spec.timezone), 1);

  const dates = occurrenceDatesBetween(spec, anchorLocal, fromLocal, toLocal);

  const startAtMs = new Date(spec.startAt).getTime();
  const endAtMs = spec.endAt ? new Date(spec.endAt).getTime() : Infinity;
  const remaining =
    spec.maxOccurrences != null
      ? Math.max(0, spec.maxOccurrences - alreadyGenerated)
      : Infinity;

  const occurrences: Occurrence[] = [];
  for (const localDate of dates) {
    if (occurrences.length >= remaining) break;
    const instant = zonedDateTimeToUtc(localDate, time, spec.timezone);
    const ms = instant.getTime();
    if (ms < fromUtc.getTime() || ms > toUtc.getTime()) continue;
    if (ms < startAtMs || ms > endAtMs) continue;
    occurrences.push({ occurrenceAt: instant.toISOString(), localDate });
  }
  return occurrences;
}

/** Próxima ocorrência estritamente depois de um instante (ou null). */
export function nextOccurrenceAfter(
  spec: RecurrenceSpec,
  afterUtc: Date,
  alreadyGenerated = 0,
  horizonDays = 370
): string | null {
  const from = new Date(afterUtc.getTime() + 1000);
  const to = new Date(afterUtc.getTime() + horizonDays * 86_400_000);
  const occ = occurrencesBetween(spec, from, to, alreadyGenerated);
  return occ.length > 0 ? occ[0].occurrenceAt : null;
}

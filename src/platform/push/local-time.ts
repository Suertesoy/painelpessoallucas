/**
 * Data/hora local a partir de um fuso IANA arbitrário (o fuso salvo por
 * dispositivo em push_subscriptions.timezone) — generaliza a mesma lógica
 * que o cron de automações já usa fixa para 'America/Sao_Paulo'
 * (src/app/api/cron/automation-tick/route.ts). Pura, sem I/O: testável com
 * relógio falso.
 */

export interface LocalDateTimeParts {
  /** YYYY-MM-DD no fuso informado. */
  date: string;
  hour: number;
  minute: number;
  /** 0=domingo … 6=sábado, no fuso informado. */
  dow: number;
}

const DOW_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localDateTimeParts(now: Date, timeZone: string): LocalDateTimeParts {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(now)) parts[p.type] = p.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    dow: DOW_MAP[parts.weekday] ?? new Date(now).getUTCDay(),
  };
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Chave de bloco de 5 minutos no fuso UTC — usada para a idempotência do push-tick. */
export function fiveMinuteBucketKey(now: Date): string {
  const minutes = now.getUTCMinutes();
  const bucketMinute = minutes - (minutes % 5);
  const bucket = new Date(now);
  bucket.setUTCMinutes(bucketMinute, 0, 0);
  return bucket.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
}

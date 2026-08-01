/**
 * Menor e maior data (`YYYY-MM-DD`) de um lote de lançamentos — usado para o
 * intervalo de uma importação (seção 9 do pedido: faturas atravessam dois
 * meses, o arquivo pode vir em ordem crescente OU decrescente). Comparação
 * puramente por string: `YYYY-MM-DD` é lexicograficamente ordenável, então
 * nunca passa por `Date`/UTC. Nunca depende da primeira ou última linha.
 */
export interface DateRange {
  start: string | null;
  end: string | null;
}

export function computeDateRange(dates: readonly string[]): DateRange {
  if (dates.length === 0) return { start: null, end: null };
  let start = dates[0];
  let end = dates[0];
  for (const date of dates) {
    if (date < start) start = date;
    if (date > end) end = date;
  }
  return { start, end };
}

/** `YYYY-MM-DD` -> `DD/MM/AAAA`, por fatiamento de string (nunca `Date`). */
export function formatDateRangeLabel(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

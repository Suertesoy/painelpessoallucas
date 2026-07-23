import { format, parseISO } from 'date-fns';

/**
 * Utilitários de data com fuso horário LOCAL.
 *
 * Regra do projeto: "hoje", agendamentos e prazos são conceitos do dia local
 * do usuário (America/Sao_Paulo), nunca do dia UTC. Por isso:
 * - NUNCA usar `new Date().toISOString().split('T')[0]` para obter o dia atual
 *   (depois das 21h locais isso retorna o dia seguinte).
 * - NUNCA usar `new Date('YYYY-MM-DD')` para interpretar inputs de data
 *   (o JS interpreta como meia-noite UTC, deslocando o dia no Brasil).
 */

/** Data de hoje no fuso local, no formato YYYY-MM-DD. */
export function todayDateStr(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * Converte o valor de um <input type="date"> (YYYY-MM-DD) para ISO 8601,
 * interpretando a data como meia-noite LOCAL.
 * Retorna undefined para valores vazios.
 */
export function dateInputToISO(value: string): string | undefined {
  if (!value) return undefined;
  return new Date(`${value}T00:00:00`).toISOString();
}

/** Converte um ISO 8601 para o formato de <input type="date"> no fuso local. */
export function isoToDateInput(iso: string | undefined): string {
  if (!iso) return '';
  return format(parseISO(iso), 'yyyy-MM-dd');
}

/**
 * Converte o valor de um <input type="datetime-local"> (YYYY-MM-DDTHH:mm)
 * para ISO 8601, interpretando o horário como LOCAL. Retorna undefined para
 * valores vazios.
 */
export function datetimeLocalToISO(value: string): string | undefined {
  if (!value) return undefined;
  return new Date(value).toISOString();
}

/** Converte um ISO 8601 para o formato de <input type="datetime-local"> no fuso local. */
export function isoToDatetimeLocalInput(iso: string | undefined): string {
  if (!iso) return '';
  return format(parseISO(iso), "yyyy-MM-dd'T'HH:mm");
}

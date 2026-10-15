/**
 * Meses como string 'YYYY-MM' e datas como 'YYYY-MM-DD', manipuladas só por
 * aritmética inteira — nunca `new Date('YYYY-MM-DD')` (regra do projeto).
 */

export type MonthKey = string; // 'YYYY-MM'
export type CardId = 'nubank_1' | 'nubank_2';

export const CARD_IDS: readonly CardId[] = ['nubank_1', 'nubank_2'];
/**
 * Os identificadores internos (`nubank_1`, `nubank_2`) são estáveis e estão
 * gravados no banco; só a APRESENTAÇÃO muda. Lucas e Matheus identificam o
 * cartão — as finanças continuam compartilhadas.
 */
export const CARD_LABELS: Record<CardId, string> = {
  nubank_1: 'Lucas',
  nubank_2: 'Matheus',
};

/** Forma longa, para onde ajuda a compreensão (ex.: seletores). */
export const CARD_FULL_LABELS: Record<CardId, string> = {
  nubank_1: 'Lucas · Nubank',
  nubank_2: 'Matheus · Nubank',
};

export function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function monthOf(date: string): MonthKey {
  return date.slice(0, 7);
}

export function addMonths(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  const mon = (index % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(mon).padStart(2, '0')}`;
}

export function compareMonths(a: MonthKey, b: MonthKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split('-').map(Number);
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/** Dia do mês limitado ao último dia (dia 31 em fevereiro vira 28/29). */
export function dateInMonth(month: MonthKey, day: number): string {
  const clamped = Math.min(Math.max(day, 1), daysInMonth(month));
  return `${month}-${String(clamped).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export function monthLabel(month: MonthKey): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} de ${y}`;
}

export function monthShortLabel(month: MonthKey): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1].slice(0, 3)}/${String(y).slice(2)}`;
}

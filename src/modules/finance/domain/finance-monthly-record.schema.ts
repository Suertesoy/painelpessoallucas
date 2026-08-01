import { z } from 'zod';
import { isoDateTimeSchema } from '@/lib/zod-datetime';

/** Mês no formato `YYYY-MM-01` (sempre dia 1 — chave, não uma data real de evento). */
export const financeMonthSchema = z.string().regex(/^\d{4}-\d{2}-01$/, 'Mês inválido (esperado YYYY-MM-01)');

export const FinanceMonthlyRecordSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string(),
  month: financeMonthSchema,
  matheusIncomeCents: z.number().int().min(0),
  lucasIncomeCents: z.number().int().min(0),
  otherIncomeCents: z.number().int().min(0),
  availableCashCents: z.number().int().min(0),
  savedCashCents: z.number().int().min(0),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type FinanceMonthlyRecord = z.infer<typeof FinanceMonthlyRecordSchema>;

/** `YYYY-MM` (mês atual, fuso local) -> chave `YYYY-MM-01` usada como `month`. */
export function monthKeyFromYearMonth(yearMonth: string): string {
  return `${yearMonth}-01`;
}

/**
 * Desloca uma chave de mês (`YYYY-MM-01`) por `deltaMonths` (positivo ou
 * negativo) usando aritmética inteira pura — nunca `Date`, para não
 * arriscar deslocamento de fuso em nenhuma plataforma.
 */
export function shiftMonthKey(month: string, deltaMonths: number): string {
  const [yearStr, monthStr] = month.split('-');
  let year = Number(yearStr);
  let monthNum = Number(monthStr) + deltaMonths;
  while (monthNum < 1) {
    monthNum += 12;
    year -= 1;
  }
  while (monthNum > 12) {
    monthNum -= 12;
    year += 1;
  }
  return `${year}-${String(monthNum).padStart(2, '0')}-01`;
}

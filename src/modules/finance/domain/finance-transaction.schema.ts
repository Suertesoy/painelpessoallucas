import { z } from 'zod';
import { isoDateTimeSchema } from '@/lib/zod-datetime';

/**
 * Data de transação financeira: `YYYY-MM-DD` puro, sem hora/fuso. Nunca
 * `new Date(...)` para interpretar — a data já chega pronta dos parsers
 * (CSV/OFX), que fazem a extração por fatiamento de string (ver
 * `csv-parser.ts`/`ofx-parser.ts`) exatamente para não deslocar o dia
 * bancário original por conversão UTC.
 */
export const financeDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (esperado YYYY-MM-DD)');

/**
 * Natureza da movimentação (seção 8 do pedido). `purchase`/`fee` aumentam o
 * gasto (valor absoluto, saída negativa); `refund` reduz o gasto da mesma
 * categoria (entrada positiva); as demais têm contribuição zero para o
 * gasto — ver `domain/money.ts#expenseContributionCents`.
 */
export const FinanceNatureSchema = z.enum([
  'purchase',
  'fee',
  'transfer',
  'invoice_payment',
  'refund',
  'unidentified_credit',
  'ignored',
]);
export type FinanceNature = z.infer<typeof FinanceNatureSchema>;

export const FinanceTransactionSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string(),
  sourceId: z.string().uuid(),
  importId: z.string().uuid(),
  importRowId: z.string().uuid(),
  transactionDate: financeDateSchema,
  description: z.string().min(1),
  originalDescription: z.string().min(1),
  amountCents: z.number().int(),
  /** Valor bruto antes da normalização de sinal do perfil — auditoria (seção 5 do pedido). */
  sourceAmountCents: z.number().int().nullable(),
  categoryId: z.string().uuid(),
  nature: FinanceNatureSchema,
  fitid: z.string().nullable(),
  fingerprint: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type FinanceTransaction = z.infer<typeof FinanceTransactionSchema>;

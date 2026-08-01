import { z } from 'zod';
import { isoDateTimeSchema } from '@/lib/zod-datetime';

export const FinanceSourceKindSchema = z.enum(['card', 'account']);
export type FinanceSourceKind = z.infer<typeof FinanceSourceKindSchema>;

export const FinanceSourceSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string(),
  name: z.string().min(1),
  kind: FinanceSourceKindSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type FinanceSource = z.infer<typeof FinanceSourceSchema>;

/**
 * Origens existem para identificar o arquivo, prevenir duplicidade e
 * interpretar pagamento de fatura — NUNCA para inferir quem fez a compra
 * (seção 4 do pedido). Inicializadas de forma idempotente por workspace.
 */
export const DEFAULT_FINANCE_SOURCES: ReadonlyArray<{ name: string; kind: FinanceSourceKind }> = [
  { name: 'Cartão Nubank Lucas', kind: 'card' },
  { name: 'Cartão C6 Lucas', kind: 'card' },
  { name: 'Cartão Nubank Matheus', kind: 'card' },
];

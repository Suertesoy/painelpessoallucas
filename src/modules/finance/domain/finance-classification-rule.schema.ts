import { z } from 'zod';
import { isoDateTimeSchema } from '@/lib/zod-datetime';
import { FinanceNatureSchema } from './finance-transaction.schema';

/**
 * Regra de classificação aprendida (seção 6 do pedido). Sempre correspondência
 * exata ou por trecho normalizado — nunca expressão regular arbitrária vinda
 * da interface. Isolada por workspace, criada só após confirmação explícita
 * do usuário ("Aplicar esta classificação a lançamentos semelhantes").
 */
export const FinanceClassificationMatchTypeSchema = z.enum(['exact', 'contains']);
export type FinanceClassificationMatchType = z.infer<typeof FinanceClassificationMatchTypeSchema>;

export const FinanceClassificationRuleSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string(),
  matchType: FinanceClassificationMatchTypeSchema,
  matchText: z.string().min(1),
  categoryId: z.string().uuid(),
  nature: FinanceNatureSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

export type FinanceClassificationRule = z.infer<typeof FinanceClassificationRuleSchema>;

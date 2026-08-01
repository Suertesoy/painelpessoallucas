import { z } from 'zod';
import { isoDateTimeSchema } from '@/lib/zod-datetime';

export const FinanceCategorySchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string(),
  slug: z.string().min(1),
  name: z.string().min(1),
  position: z.number().int(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type FinanceCategory = z.infer<typeof FinanceCategorySchema>;

/**
 * Categorias iniciais conservadoras (seção 5 do pedido). "Não classificado"
 * é o piso de toda linha sem correspondência segura — nunca fica nula.
 */
export const DEFAULT_FINANCE_CATEGORIES: ReadonlyArray<{ slug: string; name: string; position: number }> = [
  { slug: 'mercado', name: 'Mercado', position: 0 },
  { slug: 'alimentacao', name: 'Alimentação', position: 1 },
  { slug: 'casa', name: 'Casa', position: 2 },
  { slug: 'transporte', name: 'Transporte', position: 3 },
  { slug: 'saude', name: 'Saúde', position: 4 },
  { slug: 'educacao', name: 'Educação', position: 5 },
  { slug: 'assinaturas', name: 'Assinaturas', position: 6 },
  { slug: 'lazer', name: 'Lazer', position: 7 },
  { slug: 'compras', name: 'Compras', position: 8 },
  { slug: 'servicos-e-tarifas', name: 'Serviços e tarifas', position: 9 },
  { slug: 'viagens', name: 'Viagens', position: 10 },
  { slug: 'outros', name: 'Outros', position: 11 },
  { slug: 'nao-classificado', name: 'Não classificado', position: 12 },
];

export const FALLBACK_FINANCE_CATEGORY_SLUG = 'nao-classificado';

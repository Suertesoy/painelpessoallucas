import { z } from 'zod';
import { isoDateTimeSchema } from '@/lib/zod-datetime';

export const ShoppingListSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string(),
  slug: z.string().min(1),
  name: z.string().min(1),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type ShoppingList = z.infer<typeof ShoppingListSchema>;

/**
 * Listas iniciais de todo workspace. Criadas idempotentemente (por slug) na
 * primeira visita a /compras ou na primeira confirmação de uma captura
 * shopping_item — nunca por migration SQL (ver 20260731100000_shopping_lists.sql).
 * O modelo aceita listas adicionais no futuro; hoje só estas duas são semeadas.
 */
export const DEFAULT_SHOPPING_LISTS: ReadonlyArray<{ slug: string; name: string }> = [
  { slug: 'mercado', name: 'Mercado' },
  { slug: 'internet', name: 'Internet' },
];

/** Slug usado como destino de itens de compra sem lista anterior (ver backfill). */
export const FALLBACK_SHOPPING_LIST_SLUG = 'mercado';

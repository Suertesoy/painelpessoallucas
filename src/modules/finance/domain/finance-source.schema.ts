import { z } from 'zod';
import { isoDateTimeSchema } from '@/lib/zod-datetime';

export const FinanceSourceKindSchema = z.enum(['card', 'account']);
export type FinanceSourceKind = z.infer<typeof FinanceSourceKindSchema>;

/**
 * Provedor estável usado como CHAVE de lógica de resolução automática de
 * origem (seção 6 do pedido: "não use o nome visível da origem como chave de
 * lógica") — nunca o nome de exibição, que pode mudar. `generic` cobre OFX
 * sem perfil reconhecido e CSV que caiu em mapeamento manual. Origens antigas
 * (vinculadas a pessoa) predatam este conceito e ficam com `provider: null`.
 */
export const FinanceSourceProviderSchema = z.enum(['nubank', 'c6', 'generic']);
export type FinanceSourceProvider = z.infer<typeof FinanceSourceProviderSchema>;

/**
 * `active`: aparece na resolução automática do novo fluxo de importação.
 * `legacy`: origem antiga vinculada a pessoa (Lucas/Matheus) — preservada
 * para dados já existentes, mas nunca criada nem usada por importações
 * novas (seção 6 do pedido).
 */
export const FinanceSourceStatusSchema = z.enum(['active', 'legacy']);
export type FinanceSourceStatus = z.infer<typeof FinanceSourceStatusSchema>;

export const FinanceSourceSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string(),
  name: z.string().min(1),
  kind: FinanceSourceKindSchema,
  provider: FinanceSourceProviderSchema.nullable(),
  status: FinanceSourceStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type FinanceSource = z.infer<typeof FinanceSourceSchema>;

/**
 * Origens existem para identificar o arquivo, prevenir duplicidade e
 * interpretar pagamento de fatura — NUNCA para inferir quem fez a compra
 * (seção 4 do pedido). Inicializadas de forma idempotente por workspace.
 *
 * As três primeiras (`status: 'legacy'`) são as origens antigas vinculadas a
 * pessoa: continuam sendo semeadas de forma idempotente (nunca apagadas nem
 * recriadas com outro id para workspaces que já as têm — `upsert` com
 * `ignoreDuplicates`), mas nunca aparecem no novo fluxo de importação, que
 * nem chega a perguntar origem ao usuário. As três seguintes (`status:
 * 'active'`) são as origens internas automáticas resolvidas por perfil
 * detectado (seção 4) — nome estável, nunca escolhido pelo usuário.
 */
export const DEFAULT_FINANCE_SOURCES: ReadonlyArray<{
  name: string;
  kind: FinanceSourceKind;
  provider: FinanceSourceProvider | null;
  status: FinanceSourceStatus;
}> = [
  { name: 'Cartão Nubank Lucas', kind: 'card', provider: null, status: 'legacy' },
  { name: 'Cartão C6 Lucas', kind: 'card', provider: null, status: 'legacy' },
  { name: 'Cartão Nubank Matheus', kind: 'card', provider: null, status: 'legacy' },
  { name: 'Nubank • Cartão', kind: 'card', provider: 'nubank', status: 'active' },
  { name: 'Nubank • Conta', kind: 'account', provider: 'nubank', status: 'active' },
  { name: 'C6 • Cartão', kind: 'card', provider: 'c6', status: 'active' },
];

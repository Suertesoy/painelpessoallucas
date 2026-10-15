import { merchantKey, type Category } from './categories';
import { normalizeText } from '@/modules/finance/domain/normalize-text';

/**
 * Regras aprendidas de classificação de lançamentos de fatura.
 *
 * Determinísticas e auditáveis: "estabelecimento normalizado [+ valor exato]
 * => categoria". Só PREENCHEM lançamentos sem categoria: nunca sobrescrevem o
 * que o usuário já confirmou. Aplicar duas vezes dá o mesmo resultado.
 * Nada aqui toca em valores, datas ou vínculos.
 */

/** Categoria da lista do workspace (id estável + nome editável). */
export type { Category };

export interface CategoryRule {
  id: string;
  /** Descrição-base normalizada (merchantKey). */
  merchantKey: string;
  /** null = qualquer valor (só por autorização explícita). */
  amountCents: number | null;
  category: string;
}

export interface RuleTarget {
  id: string;
  baseDescription: string;
  amountCents: number;
  category: string | null;
  kind: 'purchase' | 'refund' | 'payment' | 'adjustment';
  status: 'active' | 'missing' | 'removed';
}

export interface RuleAssignment {
  itemId: string;
  category: string;
  ruleId: string;
}

const CATEGORY_ID = /^[a-z_]{2,40}$/;

/** Só o FORMATO do id; se existe no workspace é conferido no Command. */
export const isValidCategoryId = (v: string) => CATEGORY_ID.test(v);

/** Estabelecimentos que cobram serviços diferentes: por padrão a regra exige o mesmo valor. */
const AMBIGUOUS_MERCHANTS = ['apple', 'google', 'amazon', 'microsoft', 'paypal', 'mercadopago', 'pagseguro', 'pagbank', 'picpay', 'mp '];

export function isAmbiguousMerchant(key: string): boolean {
  const padded = `${key} `;
  return AMBIGUOUS_MERCHANTS.some((m) => padded.startsWith(m) || padded.includes(` ${m}`));
}

/** Regra que vale para o lançamento: a específica (estabelecimento + valor) vence a só-de-estabelecimento. */
export function findRule(item: Pick<RuleTarget, 'baseDescription' | 'amountCents'>, rules: readonly CategoryRule[]): CategoryRule | null {
  const key = merchantKey(item.baseDescription);
  const specific = rules.find((r) => r.merchantKey === key && r.amountCents !== null && r.amountCents === item.amountCents);
  if (specific) return specific;
  return rules.find((r) => r.merchantKey === key && r.amountCents === null) ?? null;
}

/**
 * Plano de aplicação das regras: só lançamentos ATIVOS ou ausentes (não
 * removidos), que não são pagamento de fatura e ainda SEM categoria.
 */
export function planRuleApplication(items: readonly RuleTarget[], rules: readonly CategoryRule[]): RuleAssignment[] {
  const out: RuleAssignment[] = [];
  for (const item of items) {
    if (item.category !== null || item.kind === 'payment' || item.status === 'removed') continue;
    const rule = findRule(item, rules);
    if (rule) out.push({ itemId: item.id, category: rule.category, ruleId: rule.id });
  }
  return out;
}

/** Texto curto e honesto para a interface. */
export function describeRule(rule: Pick<CategoryRule, 'merchantKey' | 'amountCents'>, formatMoney: (cents: number) => string): string {
  return rule.amountCents === null
    ? `${rule.merchantKey} · qualquer valor`
    : `${rule.merchantKey} · ${formatMoney(rule.amountCents)}`;
}

/** Id estável (`[a-z_]{2,40}`) a partir do nome digitado; nunca colide com os ids em uso. O id não muda quando a categoria é renomeada. */
export function slugifyCategory(label: string, taken: readonly string[]): string {
  let base = normalizeText(label).replace(/[^a-z]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36);
  if (base.length < 2) base = 'categoria';
  let id = base;
  while (taken.includes(id)) id = `${id}_x`.slice(0, 40);
  return id;
}

/** Já existe categoria com esse nome (comparando sem acentos nem maiúsculas)? Devolve o id. */
export function findCategoryByLabel(label: string, categories: readonly Category[], exceptId?: string): string | null {
  const n = normalizeText(label);
  return categories.find((c) => c.id !== exceptId && normalizeText(c.label) === n)?.id ?? null;
}

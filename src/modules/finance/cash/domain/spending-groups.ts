import { STREAMING_KEYWORDS, merchantKey } from './categories';
import { filterSpending, type SpendingFilter, type SpendingRow } from './spending';

/**
 * Leitura doméstica dos gastos: categorias de APRESENTAÇÃO e estabelecimentos.
 *
 * Nada aqui grava ou altera dados. Os ids persistidos (`category` em
 * `finance_invoice_items`) continuam os mesmos; este módulo só decide como
 * mostrá-los:
 *  - ids antigos têm um mapeamento de leitura explícito (DISPLAY_OF);
 *  - 'subscriptions' antigos com nome de streaming aparecem em Streaming;
 *  - sem categoria => grupo próprio "Sem categoria" (nunca escondido);
 *  - pagamentos de fatura e lançamentos removidos nunca entram (filterSpending).
 */

export const DISPLAY_CATEGORIES = [
  { id: 'groceries', label: 'Mercado' },
  { id: 'restaurants', label: 'Restaurantes e delivery' },
  { id: 'online', label: 'Compras online' },
  { id: 'streaming', label: 'Streaming' },
  { id: 'apps', label: 'Assinaturas e aplicativos' },
  { id: 'leisure', label: 'Lazer' },
  { id: 'housing', label: 'Moradia e contas' },
  { id: 'transport', label: 'Transporte' },
  { id: 'health', label: 'Saúde' },
  { id: 'travel', label: 'Viagens' },
  { id: 'other', label: 'Outros' },
] as const;

export type DisplayCategoryId = (typeof DISPLAY_CATEGORIES)[number]['id'] | 'none';

export const NONE_LABEL = 'Sem categoria';

/** Mapeamento de leitura auditável: id persistido -> categoria de apresentação. */
export const DISPLAY_OF: Readonly<Record<string, Exclude<DisplayCategoryId, 'none'>>> = {
  groceries: 'groceries',
  restaurants: 'restaurants',
  shopping: 'online',
  streaming: 'streaming',
  subscriptions: 'apps', // refinado por STREAMING_KEYWORDS em displayCategoryOf
  ai: 'apps',
  infrastructure: 'apps',
  software: 'apps',
  leisure: 'leisure',
  housing: 'housing',
  transport: 'transport',
  health: 'health',
  travel: 'travel',
  other: 'other',
};

export function displayLabel(id: DisplayCategoryId): string {
  if (id === 'none') return NONE_LABEL;
  return DISPLAY_CATEGORIES.find((c) => c.id === id)?.label ?? 'Outros';
}

export function displayCategoryOf(category: string | null, baseDescription: string): DisplayCategoryId {
  if (category === null) return 'none';
  const mapped = DISPLAY_OF[category] ?? 'other';
  if (category === 'subscriptions') {
    const key = ` ${merchantKey(baseDescription)} `;
    if (STREAMING_KEYWORDS.some((k) => key.includes(k.trim()))) return 'streaming';
  }
  return mapped;
}

/** Estabelecimentos reconhecíveis (chave normalizada contida na descrição). A Amazon sozinha NÃO é presumida de nenhuma categoria. */
const KNOWN_MERCHANTS: { match: string[]; name: string }[] = [
  { match: ['shopee'], name: 'Shopee' },
  { match: ['shein'], name: 'Shein' },
  { match: ['mercadolivre', 'mercado livre'], name: 'Mercado Livre' },
  { match: ['amazonmktplc', 'amazon marketplace'], name: 'Amazon Marketplace' },
  { match: ['amazonprime', 'amazon prime', 'prime video'], name: 'Amazon Prime' },
  { match: ['amazon web', 'aws'], name: 'AWS' },
  { match: ['amazon'], name: 'Amazon' },
  { match: ['aliexpress'], name: 'AliExpress' },
  { match: ['magalu', 'magazine luiza'], name: 'Magalu' },
  { match: ['netflix'], name: 'Netflix' },
  { match: ['spotify'], name: 'Spotify' },
  { match: ['disney'], name: 'Disney+' },
  { match: ['hbo', 'max.com'], name: 'Max' },
  { match: ['youtube'], name: 'YouTube' },
  { match: ['globoplay'], name: 'Globoplay' },
  { match: ['ifood'], name: 'iFood' },
  { match: ['uber'], name: 'Uber' },
  { match: ['99app', '99 '], name: '99' },
];

const toTitle = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

export function merchantName(baseDescription: string): string {
  const key = ` ${merchantKey(baseDescription)} `;
  for (const m of KNOWN_MERCHANTS) {
    if (m.match.some((k) => key.includes(k.includes(' ') || k.length > 3 ? k : ` ${k.trim()} `))) return m.name;
  }
  const words = merchantKey(baseDescription).split(' ').filter((w) => w && !/^\d+$/.test(w));
  return words.length === 0 ? 'Sem descrição' : toTitle(words.slice(0, 2).join(' '));
}

export interface MerchantGroup {
  name: string;
  cents: number;
  count: number;
  rows: SpendingRow[];
}

export interface CategoryGroup {
  id: DisplayCategoryId;
  label: string;
  cents: number;
  count: number;
  merchants: MerchantGroup[];
}

export interface SpendingBreakdown {
  totalCents: number;
  count: number;
  categories: CategoryGroup[];
  uncategorizedCents: number;
  uncategorizedCount: number;
}

export function breakdownSpending(rows: readonly SpendingRow[], filter: SpendingFilter): SpendingBreakdown {
  const filtered = filterSpending(rows, filter);
  const cats = new Map<DisplayCategoryId, CategoryGroup>();
  for (const r of filtered) {
    const base = r.baseDescription ?? r.description;
    const id = displayCategoryOf(r.category, base);
    const cat = cats.get(id) ?? { id, label: displayLabel(id), cents: 0, count: 0, merchants: [] };
    cat.cents += r.amountCents;
    cat.count += 1;
    const name = merchantName(base);
    let merchant = cat.merchants.find((m) => m.name === name);
    if (!merchant) {
      merchant = { name, cents: 0, count: 0, rows: [] };
      cat.merchants.push(merchant);
    }
    merchant.cents += r.amountCents;
    merchant.count += 1;
    merchant.rows.push(r);
    cats.set(id, cat);
  }
  const categories = [...cats.values()].sort((a, b) => b.cents - a.cents);
  for (const c of categories) {
    c.merchants.sort((a, b) => b.cents - a.cents);
    for (const m of c.merchants) m.rows.sort((a, b) => b.date.localeCompare(a.date));
  }
  const none = cats.get('none');
  return {
    totalCents: filtered.reduce((s, r) => s + r.amountCents, 0),
    count: filtered.length,
    categories,
    uncategorizedCents: none?.cents ?? 0,
    uncategorizedCount: none?.count ?? 0,
  };
}

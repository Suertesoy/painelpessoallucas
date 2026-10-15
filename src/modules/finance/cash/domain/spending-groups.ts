import { merchantKey, resolveCategoryId, type Category } from './categories';
import { filterSpending, type SpendingFilter, type SpendingRow } from './spending';

/**
 * Leitura doméstica dos gastos: categorias do workspace e estabelecimentos.
 *
 * Nada aqui grava ou altera dados. A categoria de cada lançamento é UMA só,
 * identificada por id estável; o nome exibido vem da lista do workspace
 * (renomear não quebra nada). Ids antigos que deixaram de existir (por exemplo
 * "ai", "software") valem como o alias definido em LEGACY_CATEGORY_ALIAS, só na
 * leitura. Sem categoria (ou categoria excluída) => grupo próprio "Sem
 * categoria", nunca escondido. Pagamentos de fatura e lançamentos removidos
 * nunca entram (filterSpending).
 */

export const NONE_LABEL = 'Sem categoria';

/** 'none' = sem categoria; senão o id de uma categoria do workspace. */
export type DisplayCategoryId = string;

export function displayLabel(id: DisplayCategoryId, categories: readonly Category[]): string {
  if (id === 'none') return NONE_LABEL;
  return categories.find((c) => c.id === id)?.label ?? NONE_LABEL;
}

export function displayCategoryOf(category: string | null, categories: readonly Category[]): DisplayCategoryId {
  return resolveCategoryId(category, categories) ?? 'none';
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

export function breakdownSpending(rows: readonly SpendingRow[], filter: SpendingFilter, categories: readonly Category[]): SpendingBreakdown {
  const filtered = filterSpending(rows, filter);
  const cats = new Map<DisplayCategoryId, CategoryGroup>();
  for (const r of filtered) {
    const base = r.baseDescription ?? r.description;
    const id = displayCategoryOf(r.category, categories);
    const cat = cats.get(id) ?? { id, label: displayLabel(id, categories), cents: 0, count: 0, merchants: [] };
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
  const categoryGroups = [...cats.values()].sort((a, b) => b.cents - a.cents);
  for (const c of categoryGroups) {
    c.merchants.sort((a, b) => b.cents - a.cents);
    for (const m of c.merchants) m.rows.sort((a, b) => b.date.localeCompare(a.date));
  }
  const none = cats.get('none');
  return {
    totalCents: filtered.reduce((s, r) => s + r.amountCents, 0),
    count: filtered.length,
    categories: categoryGroups,
    uncategorizedCents: none?.cents ?? 0,
    uncategorizedCount: none?.count ?? 0,
  };
}

// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { CATEGORIES, suggestClassification } from '@/modules/finance/cash/domain/categories';
import { EMPTY_FILTER, type SpendingRow } from '@/modules/finance/cash/domain/spending';
import {
  DISPLAY_OF, breakdownSpending, displayCategoryOf, merchantName,
} from '@/modules/finance/cash/domain/spending-groups';

let n = 0;
const row = (description: string, amountCents: number, category: string | null, over: Partial<SpendingRow> = {}): SpendingRow => ({
  id: `r${n++}`, card: 'nubank_1', invoiceMonth: '2026-11', date: '2026-10-20', description, baseDescription: description,
  amountCents, kind: 'purchase', status: 'active', category, purpose: null, ...over,
});

describe('mapeamento de leitura das categorias', () => {
  it('todo id persistido possível tem tradução explícita', () => {
    for (const c of CATEGORIES) expect(DISPLAY_OF[c.id], c.id).toBeTruthy();
  });

  it('ids antigos continuam válidos e sem categoria vira grupo próprio', () => {
    expect(displayCategoryOf('groceries', 'Supermercado X')).toBe('groceries');
    expect(displayCategoryOf('shopping', 'Shopee')).toBe('online');
    expect(displayCategoryOf('ai', 'OpenAI')).toBe('apps');
    expect(displayCategoryOf('infrastructure', 'Vercel')).toBe('apps');
    expect(displayCategoryOf(null, 'Qualquer')).toBe('none');
    expect(displayCategoryOf('id_desconhecido', 'X')).toBe('other');
  });

  it("'subscriptions' antigo com nome de streaming aparece em Streaming; o resto em Assinaturas", () => {
    expect(displayCategoryOf('subscriptions', 'Netflix.Com')).toBe('streaming');
    expect(displayCategoryOf('subscriptions', 'AmazonPrimeBR')).toBe('streaming');
    expect(displayCategoryOf('subscriptions', 'Apple.Com/Bill')).toBe('apps');
  });
});

describe('estabelecimentos', () => {
  it('reconhece lojas, sem presumir a Amazon', () => {
    expect(merchantName('SHOPEE *LOJA123')).toBe('Shopee');
    expect(merchantName('Shein.com')).toBe('Shein');
    expect(merchantName('MercadoLivre*Abc')).toBe('Mercado Livre');
    expect(merchantName('AmazonMktplc*Xyz')).toBe('Amazon Marketplace');
    expect(merchantName('Amazon Prime Video')).toBe('Amazon Prime');
    expect(merchantName('Amazon Br')).toBe('Amazon');
    expect(merchantName('Padaria Pão Quente 12')).toBe('Padaria Pao');
  });

  it('sugestão: Mercado Livre é Compras online (não Mercado) e Amazon sozinha fica sem sugestão', () => {
    const base = { category: null, purpose: null };
    expect(suggestClassification({ key: 'mercadolivre abc', ...base }, [])?.category).toBe('shopping');
    expect(suggestClassification({ key: 'amazon br', ...base }, [])).toBeNull();
    expect(suggestClassification({ key: 'netflix com', ...base }, [])?.category).toBe('streaming');
  });
});

describe('agrupamento dos gastos', () => {
  const rows = [
    row('Shopee A', 10000, 'shopping'),
    row('Shopee B', 5000, 'shopping'),
    row('Shein', 7000, 'shopping'),
    row('Netflix', 4000, 'streaming'),
    row('Amazon Br', 3000, null),
    row('Pagamento recebido', -90000, null, { kind: 'payment' }),
    row('Removido', 9999, 'groceries', { status: 'removed' }),
    row('Outro mês', 1234, 'groceries', { invoiceMonth: '2026-12' }),
  ];

  it('soma só compras do mês: ignora pagamento de fatura, removidos e outros meses', () => {
    const b = breakdownSpending(rows, { ...EMPTY_FILTER, month: '2026-11' });
    expect(b.totalCents).toBe(10000 + 5000 + 7000 + 4000 + 3000);
    expect(b.count).toBe(5);
  });

  it('agrupa por categoria e por loja; categorias somam o total (nada some)', () => {
    const b = breakdownSpending(rows, { ...EMPTY_FILTER, month: '2026-11' });
    const online = b.categories.find((c) => c.id === 'online')!;
    expect(online.cents).toBe(22000);
    expect(online.merchants.map((m) => [m.name, m.cents])).toEqual([['Shopee', 15000], ['Shein', 7000]]);
    expect(b.categories.reduce((s, c) => s + c.cents, 0)).toBe(b.totalCents);
  });

  it('lançamentos sem categoria ficam explícitos e a Amazon não é presumida', () => {
    const b = breakdownSpending(rows, { ...EMPTY_FILTER, month: '2026-11' });
    expect(b.uncategorizedCents).toBe(3000);
    expect(b.uncategorizedCount).toBe(1);
    expect(b.categories.find((c) => c.id === 'none')?.merchants[0].name).toBe('Amazon');
  });

  it('não altera os dados de origem', () => {
    const before = JSON.stringify(rows);
    breakdownSpending(rows, { ...EMPTY_FILTER, month: '2026-11' });
    expect(JSON.stringify(rows)).toBe(before);
  });
});

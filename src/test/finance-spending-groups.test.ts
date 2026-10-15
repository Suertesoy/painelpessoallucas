// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { DEFAULT_CATEGORIES, LEGACY_CATEGORY_ALIAS, categoryLabel, resolveCategoryId, suggestClassification } from '@/modules/finance/cash/domain/categories';
import { EMPTY_FILTER, type SpendingRow } from '@/modules/finance/cash/domain/spending';
import { breakdownSpending, displayCategoryOf, merchantName } from '@/modules/finance/cash/domain/spending-groups';

let n = 0;
const row = (description: string, amountCents: number, category: string | null, over: Partial<SpendingRow> = {}): SpendingRow => ({
  id: `r${n++}`, card: 'nubank_1', invoiceMonth: '2026-11', date: '2026-10-20', description, baseDescription: description,
  amountCents, kind: 'purchase', status: 'active', category, purpose: null, ...over,
});

const LIST = [...DEFAULT_CATEGORIES];

describe('lista inicial de categorias', () => {
  it('traz as 11 categorias domésticas aprovadas, com ids estáveis', () => {
    expect(DEFAULT_CATEGORIES.map((c) => c.label)).toEqual([
      'Mercado', 'Restaurantes e delivery', 'Compras online', 'Streaming', 'Assinaturas e aplicativos', 'Lazer',
      'Moradia e contas', 'Transporte', 'Saúde', 'Viagens', 'Outros',
    ]);
    expect(new Set(DEFAULT_CATEGORIES.map((c) => c.id)).size).toBe(11);
  });

  it('o nome vem da lista do workspace: renomear não muda o id nem quebra a leitura', () => {
    const renamed = LIST.map((c) => (c.id === 'groceries' ? { ...c, label: 'Supermercado' } : c));
    expect(categoryLabel('groceries', renamed)).toBe('Supermercado');
    expect(displayCategoryOf('groceries', renamed)).toBe('groceries');
  });

  it('categoria excluída ou desconhecida aparece como "Sem categoria" (nunca some nem vira outra)', () => {
    const without = LIST.filter((c) => c.id !== 'leisure');
    expect(displayCategoryOf('leisure', without)).toBe('none');
    expect(categoryLabel('leisure', without)).toBe('Sem categoria');
    expect(displayCategoryOf(null, LIST)).toBe('none');
  });

  it('ids legados (ai, infrastructure, software) leem como Assinaturas e aplicativos, só se ela existir', () => {
    expect(LEGACY_CATEGORY_ALIAS).toEqual({ ai: 'subscriptions', infrastructure: 'subscriptions', software: 'subscriptions' });
    expect(displayCategoryOf('infrastructure', LIST)).toBe('subscriptions');
    expect(resolveCategoryId('ai', LIST.filter((c) => c.id !== 'subscriptions'))).toBeNull();
  });
});

describe('estabelecimentos e sugestões', () => {
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
  const filter = { ...EMPTY_FILTER, month: '2026-11' };

  it('soma só compras do mês: ignora pagamento de fatura, removidos e outros meses', () => {
    const b = breakdownSpending(rows, filter, LIST);
    expect(b.totalCents).toBe(10000 + 5000 + 7000 + 4000 + 3000);
    expect(b.count).toBe(5);
  });

  it('agrupa por categoria e por loja; categorias somam o total (nada some)', () => {
    const b = breakdownSpending(rows, filter, LIST);
    const online = b.categories.find((c) => c.id === 'shopping')!;
    expect(online).toMatchObject({ label: 'Compras online', cents: 22000 });
    expect(online.merchants.map((m) => [m.name, m.cents])).toEqual([['Shopee', 15000], ['Shein', 7000]]);
    expect(b.categories.reduce((s, c) => s + c.cents, 0)).toBe(b.totalCents);
  });

  it('lançamentos sem categoria ficam explícitos e a Amazon não é presumida', () => {
    const b = breakdownSpending(rows, filter, LIST);
    expect(b.uncategorizedCents).toBe(3000);
    expect(b.uncategorizedCount).toBe(1);
    expect(b.categories.find((c) => c.id === 'none')?.merchants[0].name).toBe('Amazon');
  });

  it('categoria criada pelo usuário e categoria renomeada aparecem com o nome atual', () => {
    const custom = [...LIST.map((c) => (c.id === 'shopping' ? { ...c, label: 'Lojas online' } : c)), { id: 'armazenamento', label: 'Armazenamento' }];
    const b = breakdownSpending([...rows, row('Apple.com/Bill', 6690, 'armazenamento')], filter, custom);
    expect(b.categories.find((c) => c.id === 'armazenamento')).toMatchObject({ label: 'Armazenamento', cents: 6690 });
    expect(b.categories.find((c) => c.id === 'shopping')?.label).toBe('Lojas online');
  });

  it('não altera os dados de origem', () => {
    const before = JSON.stringify(rows);
    breakdownSpending(rows, filter, LIST);
    expect(JSON.stringify(rows)).toBe(before);
  });
});

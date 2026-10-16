// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { sortCategories, suggestReplacementCategory, DEFAULT_CATEGORIES } from '@/modules/finance/cash/domain/categories';
import { deleteCategory, countCategoryUse } from '@/modules/finance/cash/infrastructure/category-crud';
import { HideValuesContext, Money } from '@/components/finance-cash/ui';

afterEach(cleanup);

describe('categorias em ordem alfabética (pt-BR)', () => {
  it('ignora acentos, maiúsculas e ordem de criação', () => {
    const sorted = sortCategories([
      { id: 'z', label: 'Zeladoria' },
      { id: 'a', label: 'Água' },
      { id: 'e', label: 'educação' },
      { id: 'b', label: 'Bebê' },
      { id: 'o', label: 'Outros' },
    ]).map((c) => c.label);
    expect(sorted).toEqual(['Água', 'Bebê', 'educação', 'Outros', 'Zeladoria']);
  });
  it('não altera a lista original', () => {
    const original = [...DEFAULT_CATEGORIES];
    sortCategories(DEFAULT_CATEGORIES);
    expect([...DEFAULT_CATEGORIES]).toEqual(original);
  });
});

describe('substituta sugerida ao excluir', () => {
  it('"Delivery" → "Restaurantes e delivery"', () => {
    const delivery = { id: 'delivery', label: 'Delivery' };
    expect(suggestReplacementCategory(delivery, [...DEFAULT_CATEGORIES, delivery])?.id).toBe('restaurants');
  });
  it('sem candidato claro, não sugere', () => {
    expect(suggestReplacementCategory({ id: 'pets', label: 'Pets' }, DEFAULT_CATEGORIES)).toBeNull();
  });
  it('ambíguo (dois candidatos) não sugere', () => {
    const others = [{ id: 'a', label: 'Mercado livre' }, { id: 'b', label: 'Mercado do bairro' }];
    expect(suggestReplacementCategory({ id: 'm', label: 'Mercado' }, others)).toBeNull();
  });
});

type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] };

function fakeSupabase(counts: Record<string, number> = {}) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: 'select', filters: [] };
    const chain: Record<string, unknown> = {};
    const done = () => {
      calls.push(call);
      return Promise.resolve({ error: null, count: counts[table] ?? 0, data: [] });
    };
    for (const m of ['eq', 'in', 'neq']) chain[m] = (k: string, v: unknown) => { call.filters.push([k, v]); return chain; };
    chain.update = (p: unknown) => { call.op = 'update'; call.payload = p; return chain; };
    chain.delete = () => { call.op = 'delete'; return chain; };
    chain.select = () => chain;
    chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => done().then(res, rej);
    return chain;
  };
  return { client: { from } as never, calls };
}

describe('excluir categoria', () => {
  it('com substituta: lançamentos, despesas, COMPROMISSOS e regras migram; só depois a categoria sai', async () => {
    const { client, calls } = fakeSupabase();
    await deleteCategory(client, 'ws', 'delivery', 'restaurants');
    const ops = calls.map((c) => `${c.table}:${c.op}`);
    expect(ops).toEqual([
      'finance_invoice_items:update',
      'finance_expenses:update',
      'finance_commitments:update',
      'finance_category_rules:update',
      'finance_item_categories:delete',
    ]);
    expect(calls[2].payload).toEqual({ category: 'restaurants' });
  });

  it('sem substituta: ficam sem categoria e as regras são excluídas (nenhuma referência inválida)', async () => {
    const { client, calls } = fakeSupabase();
    await deleteCategory(client, 'ws', 'delivery', null);
    expect(calls.find((c) => c.table === 'finance_invoice_items')?.payload).toMatchObject({ category: null });
    expect(calls.find((c) => c.table === 'finance_commitments')?.payload).toEqual({ category: null });
    expect(calls.find((c) => c.table === 'finance_category_rules')?.op).toBe('delete');
  });

  it('nunca toca em valores ou datas', async () => {
    const { client, calls } = fakeSupabase();
    await deleteCategory(client, 'ws', 'delivery', 'restaurants');
    for (const c of calls.filter((x) => x.op === 'update')) {
      const keys = Object.keys(c.payload as object);
      expect(keys.every((k) => k.startsWith('category'))).toBe(true);
    }
  });

  it('a contagem inclui faturas, despesas e compromissos', async () => {
    const { client } = fakeSupabase({ finance_invoice_items: 2, finance_expenses: 3, finance_commitments: 1 });
    expect(await countCategoryUse(client, 'ws', 'delivery')).toBe(6);
  });

  it('substituta igual à excluída é rejeitada', async () => {
    const { client } = fakeSupabase();
    await expect(deleteCategory(client, 'ws', 'x', 'x')).rejects.toThrow();
  });
});

describe('ocultar valores (privacidade visual)', () => {
  it('mostra "••••" e esconde o número', () => {
    render(
      <HideValuesContext.Provider value>
        <Money cents={123456} />
      </HideValuesContext.Provider>
    );
    expect(screen.getByLabelText('valor oculto').textContent).toContain('••••');
    expect(document.body.textContent).not.toMatch(/1\.234/);
  });
  it('por padrão mostra o valor', () => {
    render(<Money cents={123456} />);
    expect(document.body.textContent).toMatch(/1\.234,56/);
  });
});

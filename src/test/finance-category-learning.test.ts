// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupabaseFinanceCashRepository } from '@/modules/finance/cash/infrastructure/supabase-finance-cash.repository';
import { FinanceCashCommands } from '@/modules/finance/cash/application/finance-cash.commands';
import {
  applyCategoryRules, deleteCategoryRule, listCategoryRules, saveCategoryRule, changeRuleCategory,
} from '@/modules/finance/cash/infrastructure/category-learning';
import {
  findCategoryByLabel, findRule, isAmbiguousMerchant, planRuleApplication, slugifyCategory,
  type CategoryRule, type RuleTarget,
} from '@/modules/finance/cash/domain/category-rules';
import { categoryLabel, suggestClassification } from '@/modules/finance/cash/domain/categories';
import { EMPTY_FILTER, type SpendingRow } from '@/modules/finance/cash/domain/spending';
import { breakdownSpending, displayCategoryOf } from '@/modules/finance/cash/domain/spending-groups';

/* ------------------------------------------------------------------ fake */
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Supabase em memória: filtros eq/is/neq/in, update/delete/insert, count head e unicidade de rótulo. */
function createDb(initial: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(initial));
  let seq = 0;
  const rows = (t: string) => (tables[t] ??= []);

  class Q {
    private filters: ((r: Row) => boolean)[] = [];
    private mode: 'select' | 'update' | 'delete' | 'insert' = 'select';
    private patch: Row = {};
    private returning = false;
    private head = false;
    constructor(private table: string) {}
    select(_cols?: string, opts?: { count?: string; head?: boolean }) { if (this.mode !== 'select') this.returning = true; if (opts?.head) this.head = true; return this; }
    insert(p: Row) { this.mode = 'insert'; this.patch = p; return this; }
    update(p: Row) { this.mode = 'update'; this.patch = p; return this; }
    delete() { this.mode = 'delete'; return this; }
    eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
    neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
    is(c: string, v: unknown) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
    in(c: string, v: unknown[]) { this.filters.push((r) => v.includes(r[c])); return this; }
    order() { return this; }
    private run(): { data: Row[] | null; error: { message: string; code?: string } | null; count?: number } {
      if (tables.__missing?.some((m) => m.name === this.table)) return { data: null, error: { message: 'missing', code: '42P01' } };
      const matched = rows(this.table).filter((r) => this.filters.every((f) => f(r)));
      if (this.mode === 'insert') {
        if (this.table === 'finance_custom_categories' && rows(this.table).some((r) => r.workspace_id === this.patch.workspace_id && String(r.label).toLowerCase() === String(this.patch.label).toLowerCase())) {
          return { data: null, error: { message: 'dup', code: '23505' } };
        }
        const row = { id: `gen-${++seq}`, ...this.patch };
        rows(this.table).push(row);
        return { data: [row], error: null };
      }
      if (this.mode === 'update') { matched.forEach((r) => Object.assign(r, this.patch)); return { data: this.returning ? matched : null, error: null }; }
      if (this.mode === 'delete') { tables[this.table] = rows(this.table).filter((r) => !matched.includes(r)); return { data: null, error: null }; }
      return { data: this.head ? null : matched, error: null, count: matched.length };
    }
    async maybeSingle() { const r = this.run(); return { data: r.data?.[0] ?? null, error: r.error }; }
    async single() { const r = this.run(); return { data: r.data?.[0] ?? null, error: r.error }; }
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) { return Promise.resolve(this.run()).then(resolve, reject); }
  }
  const client = { from: (t: string) => new Q(t), tables };
  return client;
}

const WS = 'ws-1';
const OTHER = 'ws-2';
const item = (id: string, base: string, amount: number, over: Row = {}): Row => ({
  id, workspace_id: WS, invoice_id: 'inv-1', purchase_date: '2026-10-05', description: base.toUpperCase(),
  normalized_description: base, amount_cents: amount, kind: 'purchase', occurrence_index: 0, installment_no: null,
  installment_total: null, base_description: base, status: 'active', commitment_id: null, review_note: null,
  category: null, purpose: null, category_source: null, category_rule_id: null, ...over,
});

const FINANCIAL = ['amount_cents', 'purchase_date', 'invoice_id', 'commitment_id', 'kind', 'status', 'description'];
const financial = (rs: Row[]) => rs.map((r) => Object.fromEntries(FINANCIAL.map((k) => [k, r[k]])));

/* ----------------------------------------------------------------- domínio */
describe('regras: domínio puro', () => {
  const rules: CategoryRule[] = [
    { id: 'r-any', merchantKey: 'apple com bill', amountCents: null, category: 'subscriptions' },
    { id: 'r-66', merchantKey: 'apple com bill', amountCents: 6690, category: 'armazenamento' },
  ];
  const t = (id: string, base: string, amount: number, over: Partial<RuleTarget> = {}): RuleTarget =>
    ({ id, baseDescription: base, amountCents: amount, category: null, kind: 'purchase', status: 'active', ...over });

  it('a regra específica (estabelecimento + valor) vence a de qualquer valor', () => {
    expect(findRule({ baseDescription: 'APPLE.COM/BILL', amountCents: 6690 }, rules)?.id).toBe('r-66');
    expect(findRule({ baseDescription: 'APPLE.COM/BILL', amountCents: 3990 }, rules)?.id).toBe('r-any');
  });

  it('regra só com valor não pega outro valor do mesmo estabelecimento (APPLE.COM/BILL ambíguo)', () => {
    expect(findRule({ baseDescription: 'Apple.com/Bill', amountCents: 3990 }, [rules[1]])).toBeNull();
    expect(isAmbiguousMerchant('apple com bill')).toBe(true);
    expect(isAmbiguousMerchant('padaria pao quente')).toBe(false);
  });

  it('só planeja lançamentos sem categoria, ativos e que não são pagamento', () => {
    const plan = planRuleApplication([
      t('a', 'apple com bill', 6690),
      t('b', 'apple com bill', 6690, { category: 'other' }),
      t('c', 'apple com bill', 6690, { kind: 'payment' }),
      t('d', 'apple com bill', 6690, { status: 'removed' }),
      t('e', 'apple com bill', 3990),
      t('f', 'netflix', 5590),
    ], rules);
    expect(plan.map((p) => [p.itemId, p.category])).toEqual([['a', 'armazenamento'], ['e', 'subscriptions']]);
  });

  it('é idempotente: depois de aplicar, um novo plano é vazio', () => {
    const items = [t('a', 'apple com bill', 6690)];
    const first = planRuleApplication(items, rules);
    const applied = items.map((i) => ({ ...i, category: first.find((p) => p.itemId === i.id)?.category ?? i.category }));
    expect(planRuleApplication(applied, rules)).toEqual([]);
  });

  it('gera ids de categoria válidos e reaproveita nomes existentes', () => {
    expect(slugifyCategory('Armazenamento', [])).toBe('armazenamento');
    expect(slugifyCategory('Saúde da casa!', [])).toBe('saude_da_casa');
    expect(slugifyCategory('Armazenamento', ['armazenamento'])).toBe('armazenamento_x');
    expect(slugifyCategory('123', [])).toBe('categoria');
    expect(findCategoryByLabel('streaming', [], categoryLabel)).toBe('streaming');
    expect(findCategoryByLabel(' ARMAZENAMENTO ', [{ id: 'armazenamento', label: 'Armazenamento' }], categoryLabel)).toBe('armazenamento');
    expect(findCategoryByLabel('Nova', [], categoryLabel)).toBeNull();
  });

  it('sugestões continuam existindo e consideram o histórico em categorias personalizadas', () => {
    const all = [{ id: '1', key: 'apple com bill', category: 'armazenamento', purpose: null }, { id: '2', key: 'apple com bill', category: null, purpose: null }];
    expect(suggestClassification(all[1], all)).toBeNull(); // id desconhecido sem a lista de personalizadas
    expect(suggestClassification(all[1], all, ['armazenamento'])).toEqual({ category: 'armazenamento', purpose: null, source: 'history' });
  });
});

/* -------------------------------------------------------------- persistência */
describe('regras: persistência e aplicação', () => {
  let db: ReturnType<typeof createDb>;
  beforeEach(() => {
    db = createDb({
      finance_invoice_items: [
        item('a', 'apple com bill', 6690),
        item('b', 'apple com bill', 6690, { invoice_id: 'inv-2', purchase_date: '2026-11-05' }),
        item('c', 'apple com bill', 3990),
        item('u', 'apple com bill', 6690, { category: 'software', category_source: 'user' }),
        item('pay', 'apple com bill', 6690, { kind: 'payment' }),
        item('gone', 'apple com bill', 6690, { status: 'removed' }),
        item('x', 'apple com bill', 6690, { workspace_id: OTHER }),
      ],
      finance_category_rules: [],
    });
  });
  const cat = (id: string) => db.tables.finance_invoice_items.find((r) => r.id === id)?.category ?? null;

  it('aplica só onde não há categoria, sem sobrescrever o confirmado e sem cruzar workspaces', async () => {
    await saveCategoryRule(db as never, WS, { merchantKey: 'apple com bill', amountCents: 6690, category: 'armazenamento' });
    const before = JSON.stringify(financial(db.tables.finance_invoice_items));
    const applied = await applyCategoryRules(db as never, WS);
    expect(applied).toBe(2);
    expect(['a', 'b'].map(cat)).toEqual(['armazenamento', 'armazenamento']);
    expect(cat('u')).toBe('software'); // confirmado pelo usuário: intocado
    expect(db.tables.finance_invoice_items.find((r) => r.id === 'u')?.category_source).toBe('user');
    expect(['c', 'pay', 'gone', 'x'].map(cat)).toEqual([null, null, null, null]);
    expect(db.tables.finance_invoice_items.find((r) => r.id === 'a')).toMatchObject({ category_source: 'rule' });
    expect(JSON.stringify(financial(db.tables.finance_invoice_items))).toBe(before); // valores, datas e vínculos
  });

  it('reimportar/reaplicar é idempotente: segunda execução não muda nada', async () => {
    await saveCategoryRule(db as never, WS, { merchantKey: 'apple com bill', amountCents: 6690, category: 'armazenamento' });
    await applyCategoryRules(db as never, WS);
    const snapshot = JSON.stringify(db.tables.finance_invoice_items);
    expect(await applyCategoryRules(db as never, WS)).toBe(0);
    expect(JSON.stringify(db.tables.finance_invoice_items)).toBe(snapshot);
  });

  it('regra de outro workspace não é aplicada nem listada', async () => {
    db.tables.finance_category_rules.push({ id: 'foreign', workspace_id: OTHER, merchant_key: 'apple com bill', amount_cents: null, category: 'other' });
    expect(await listCategoryRules(db as never, WS)).toEqual([]);
    expect(await applyCategoryRules(db as never, WS)).toBe(0);
    expect(cat('a')).toBeNull();
  });

  it('salvar a mesma regra de novo troca a categoria, sem duplicar', async () => {
    await saveCategoryRule(db as never, WS, { merchantKey: 'apple com bill', amountCents: 6690, category: 'armazenamento' });
    await saveCategoryRule(db as never, WS, { merchantKey: 'apple com bill', amountCents: 6690, category: 'software' });
    await saveCategoryRule(db as never, WS, { merchantKey: 'apple com bill', amountCents: null, category: 'subscriptions' });
    const rules = await listCategoryRules(db as never, WS);
    expect(rules.map((r) => [r.amountCents, r.category])).toEqual([[6690, 'software'], [null, 'subscriptions']]);
  });

  it('corrigir a regra muda só o que ela aplicou', async () => {
    const rule = await saveCategoryRule(db as never, WS, { merchantKey: 'apple com bill', amountCents: 6690, category: 'armazenamento' });
    await applyCategoryRules(db as never, WS);
    await changeRuleCategory(db as never, WS, rule.id, 'software');
    expect(['a', 'b'].map(cat)).toEqual(['software', 'software']);
    expect(db.tables.finance_invoice_items.find((r) => r.id === 'u')).toMatchObject({ category: 'software', category_source: 'user' });
  });

  it('excluir a regra com reversão devolve "sem categoria" só aos lançamentos dela', async () => {
    const rule = await saveCategoryRule(db as never, WS, { merchantKey: 'apple com bill', amountCents: 6690, category: 'armazenamento' });
    await applyCategoryRules(db as never, WS);
    await deleteCategoryRule(db as never, WS, rule.id, true);
    expect(['a', 'b'].map(cat)).toEqual([null, null]);
    expect(cat('u')).toBe('software');
    expect(db.tables.finance_category_rules).toHaveLength(0);
    expect(await applyCategoryRules(db as never, WS)).toBe(0); // sem regra, nada volta a ser aplicado
  });

  it('excluir sem reverter mantém a categoria como sua', async () => {
    const rule = await saveCategoryRule(db as never, WS, { merchantKey: 'apple com bill', amountCents: 6690, category: 'armazenamento' });
    await applyCategoryRules(db as never, WS);
    await deleteCategoryRule(db as never, WS, rule.id, false);
    expect(db.tables.finance_invoice_items.find((r) => r.id === 'a')).toMatchObject({ category: 'armazenamento', category_source: 'user', category_rule_id: null });
  });

  it('antes da migration (tabelas ausentes) as listas vêm vazias e nada quebra', async () => {
    db.tables.__missing = [{ name: 'finance_category_rules' }, { name: 'finance_custom_categories' }];
    expect(await listCategoryRules(db as never, WS)).toEqual([]);
    expect(await applyCategoryRules(db as never, WS)).toBe(0);
  });
});

/* ------------------------------------------------------ comandos ponta a ponta */
describe('comandos: classificar e aprender', () => {
  let db: ReturnType<typeof createDb>;
  let commands: FinanceCashCommands;
  const UA = '00000000-0000-4000-8000-00000000000a';
  const UB = '00000000-0000-4000-8000-00000000000b';
  const UC = '00000000-0000-4000-8000-00000000000c';
  const UN = '00000000-0000-4000-8000-00000000000d';
  const UPAY = '00000000-0000-4000-8000-00000000000e';
  const events: { type: string; payload: Record<string, unknown> }[] = [];

  beforeEach(() => {
    events.length = 0;
    db = createDb({
      finance_invoice_items: [
        item(UA, 'apple com bill', 6690),
        item(UB, 'apple com bill', 6690, { purchase_date: '2026-11-05' }),
        item(UC, 'apple com bill', 3990),
        item(UN, 'netflix', 5590),
        item(UPAY, 'pagamento recebido', 90000, { kind: 'payment' }),
      ],
    });
    const notifier = { notify: vi.fn(), subscribe: () => () => {} };
    const repo = new SupabaseFinanceCashRepository(db as never, WS, notifier as never);
    commands = new FinanceCashCommands(repo, { save: async (e: never) => { events.push(e); } } as never, WS);
  });
  const cat = (id: string) => db.tables.finance_invoice_items.find((r) => r.id === id)?.category ?? null;
  const src = (id: string) => db.tables.finance_invoice_items.find((r) => r.id === id)?.category_source ?? null;

  it('cria categoria personalizada sem alterar código e reaproveita nomes existentes', async () => {
    const id = await commands.createCategory('Armazenamento');
    expect(id).toBe('armazenamento');
    expect(await commands.createCategory('  armazenamento ')).toBe('armazenamento');
    expect(await commands.createCategory('Streaming')).toBe('streaming'); // nativa: sem duplicar
    expect(db.tables.finance_custom_categories).toHaveLength(1);
    await expect(commands.createCategory('x')).rejects.toThrow(/2 a 40/);
  });

  it('classificar à mão NÃO aprende nada (opt-in) e marca como confirmada', async () => {
    const id = await commands.createCategory('Armazenamento');
    await commands.classifyItems({ itemIds: [UA], category: id });
    expect(cat(UA)).toBe('armazenamento');
    expect(src(UA)).toBe('user');
    expect(cat(UB)).toBeNull();
    expect(db.tables.finance_category_rules ?? []).toHaveLength(0);
  });

  it('rejeita categoria inexistente do workspace', async () => {
    await expect(commands.classifyItems({ itemIds: [UA], category: 'inventada' })).rejects.toThrow(/inválida/i);
    expect(cat(UA)).toBeNull();
  });

  it('APPLE.COM/BILL por estabelecimento + valor: aplica ao mesmo valor e deixa outro valor para revisão', async () => {
    const id = await commands.createCategory('Armazenamento');
    const { applied } = await commands.classifyAndLearn(UA, id, 'amount');
    expect(applied).toBe(1);
    expect([cat(UA), cat(UB), cat(UC), cat(UN)]).toEqual(['armazenamento', 'armazenamento', null, null]);
    expect([src(UA), src(UB)]).toEqual(['user', 'rule']);
  });

  it('qualquer valor só quando autorizado explicitamente', async () => {
    const id = await commands.createCategory('Armazenamento');
    await commands.classifyAndLearn(UA, id, 'merchant');
    expect([cat(UB), cat(UC)]).toEqual(['armazenamento', 'armazenamento']);
    expect(cat(UN)).toBeNull();
    const rules = db.tables.finance_category_rules;
    expect(rules[0]).toMatchObject({ amount_cents: null });
  });

  it('nunca sobrescreve classificação confirmada ao aprender', async () => {
    const id = await commands.createCategory('Armazenamento');
    await commands.classifyItems({ itemIds: [UB], category: 'software' });
    await commands.classifyAndLearn(UA, id, 'amount');
    expect(cat(UB)).toBe('software');
    expect(src(UB)).toBe('user');
  });

  it('pagamento de fatura não é classificado', async () => {
    await expect(commands.classifyAndLearn(UPAY, 'other', 'amount')).rejects.toThrow(/Pagamentos/);
  });

  it('corrigir manualmente um item aplicado por regra o torna confirmado', async () => {
    const id = await commands.createCategory('Armazenamento');
    await commands.classifyAndLearn(UA, id, 'amount');
    await commands.classifyItems({ itemIds: [UB], category: 'other' });
    expect([cat(UB), src(UB)]).toEqual(['other', 'user']);
    await commands.deleteCategoryRule(db.tables.finance_category_rules[0].id, true);
    expect(cat(UB)).toBe('other'); // confirmado: a exclusão da regra não o desfaz
  });

  it('eventos de domínio não carregam valores monetários', async () => {
    const id = await commands.createCategory('Armazenamento');
    await commands.classifyAndLearn(UA, id, 'amount');
    expect(events.map((e) => e.type)).toContain('finance.category_rule_saved');
    expect(JSON.stringify(events)).not.toMatch(/6690|amount_cents|amountCents/);
  });

  it('valores, datas e vínculos permanecem idênticos após tudo', async () => {
    const before = JSON.stringify(financial(db.tables.finance_invoice_items));
    const id = await commands.createCategory('Armazenamento');
    await commands.classifyAndLearn(UA, id, 'merchant');
    await commands.deleteCategoryRule(db.tables.finance_category_rules[0].id, true);
    expect(JSON.stringify(financial(db.tables.finance_invoice_items))).toBe(before);
  });
});

/* -------------------------------------------------- apresentação de gastos */
describe('categoria personalizada na apresentação', () => {
  const custom = [{ id: 'armazenamento', label: 'Armazenamento' }];
  const row = (id: string, base: string, cents: number, category: string | null): SpendingRow => ({
    id, card: 'nubank_1', invoiceMonth: '2026-11', date: '2026-10-20', description: base, baseDescription: base,
    amountCents: cents, kind: 'purchase', status: 'active', category, purpose: null,
  });

  it('aparece como grupo próprio com o nome criado e entra no total', () => {
    expect(displayCategoryOf('armazenamento', 'Apple.com/Bill', custom)).toBe('armazenamento');
    expect(displayCategoryOf('armazenamento', 'Apple.com/Bill')).toBe('other'); // sem a lista: não quebra
    const b = breakdownSpending([row('1', 'Apple.com/Bill', 6690, 'armazenamento'), row('2', 'Shopee', 1000, 'shopping')], { ...EMPTY_FILTER, month: '2026-11' }, custom);
    expect(b.categories.find((c) => c.id === 'armazenamento')).toMatchObject({ label: 'Armazenamento', cents: 6690 });
    expect(b.categories.reduce((s, c) => s + c.cents, 0)).toBe(b.totalCents);
  });
});

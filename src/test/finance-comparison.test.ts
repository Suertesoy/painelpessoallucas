// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildCardComparison } from '@/modules/finance/cash/domain/card-comparison';
import type { CardGoal } from '@/modules/finance/cash/domain/card-goals';
import { L, M, source, TODAY } from './helpers-finance-month';

const GOALS: CardGoal[] = [
  { id: '1', scope: 'default', month: '2026-08', amountCents: 700000, updatedAt: null },
  { id: '2', scope: 'month', month: '2026-09', amountCents: 800000, updatedAt: null },
];

const compare = (over: Partial<Parameters<typeof buildCardComparison>[0]> = {}) =>
  buildCardComparison({ today: TODAY, invoices: source().invoices, goals: GOALS, months: 6, ...over });
const row = (r: ReturnType<typeof compare>, month: string) => r.rows.find((x) => x.month === month)!;

describe('comparativo: meta × gasto efetivo nos cartões', () => {
  it('uma linha por mês, do mais antigo ao mais recente, terminando no último mês com dado', () => {
    const r = compare();
    expect(r.rows.map((x) => x.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  });

  it('gasto efetivo = soma das faturas lançadas dos dois cartões, em centavos inteiros', () => {
    const r = compare();
    expect(row(r, '2026-08').spentCents).toBe(400000 + 374031);
    expect(row(r, '2026-10').spentCents).toBe(100000 + 250000);
    expect(row(r, '2026-08').byCard.map((c) => c.cents)).toEqual([400000, 374031]);
    for (const x of r.rows) expect(Number.isInteger(x.spentCents)).toBe(true);
  });

  it('identifica períodos sem meta e a origem da meta (padrão × exceção)', () => {
    const r = compare();
    expect(r.monthsWithoutGoal).toEqual(['2026-06', '2026-07']);
    expect(row(r, '2026-08')).toMatchObject({ goalCents: 700000, goalSource: 'default' });
    expect(row(r, '2026-09')).toMatchObject({ goalCents: 800000, goalSource: 'month' });
    expect(row(r, '2026-10')).toMatchObject({ goalCents: 700000, goalSource: 'default' });
  });

  it('acima/abaixo da meta com diferença exata', () => {
    const r = compare();
    expect(row(r, '2026-08')).toMatchObject({ overGoal: true, differenceCents: 700000 - 774031 });
    expect(row(r, '2026-09')).toMatchObject({ overGoal: false, differenceCents: 800000 - 774031 });
    expect(row(r, '2026-07')).toMatchObject({ overGoal: false, differenceCents: null });
  });

  it('distingue mês fechado, com fatura aberta, sem fatura e ainda em curso/futuro', () => {
    const inv = [...source().invoices.filter((i) => !(i.card === 'nubank_2' && i.month === '2026-08')), L('2026-06', 300000, 'open')];
    const r = buildCardComparison({ today: TODAY, invoices: inv, goals: GOALS, months: 6 });
    expect(row(r, '2026-09').status).toBe('closed');
    expect(row(r, '2026-08').status).toBe('missing'); // Matheus sem fatura
    expect(row(r, '2026-06').status).toBe('missing');
    expect(row(r, '2026-10').status).toBe('future'); // mês atual ainda não terminou
    expect(row(r, '2026-11').status).toBe('future');
    const open = buildCardComparison({ today: TODAY, invoices: [L('2026-05', 1, 'open'), M('2026-05', 1, 'paid')], goals: [], months: 6 });
    expect(row(open, '2026-05').status).toBe('open');
  });

  it('só usa faturas lançadas: nenhuma estimativa pela média e nenhuma parcela somada à parte', () => {
    const withItems = compare({ invoices: source().invoices });
    // as parcelas importadas (itens) estão dentro das faturas; o gasto do mês é exatamente o das faturas
    expect(row(withItems, '2026-11').spentCents).toBe(150000);
    const futureMonth = buildCardComparison({ today: TODAY, invoices: [], goals: [], months: 3 });
    expect(futureMonth.rows.every((x) => x.spentCents === 0)).toBe(true);
  });

  it('o gráfico escala pelo maior valor entre gasto e meta', () => {
    const r = compare();
    expect(r.maxCents).toBe(Math.max(...r.rows.flatMap((x) => [x.spentCents, x.goalCents ?? 0])));
  });

  it('sem faturas nem metas, ainda devolve a janela de meses (sem quebrar)', () => {
    const r = buildCardComparison({ today: TODAY, invoices: [], goals: [], months: 12 });
    expect(r.rows).toHaveLength(12);
    expect(r.monthsWithoutGoal).toHaveLength(12);
    expect(r.maxCents).toBe(0);
  });
});

describe('layout responsivo e acessibilidade (estrutura)', () => {
  const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8');

  it('o gráfico rola na horizontal no celular e a tabela de valores exatos existe', () => {
    const chart = read('src/components/finance-cash/comparison-chart.tsx');
    expect(chart).toMatch(/overflow-x-auto/);
    expect(chart).toMatch(/<table/);
    expect(chart).toMatch(/<caption/);
    expect(chart).toMatch(/scope="col"/);
    expect(chart).toMatch(/scope="row"/);
    expect(chart).toMatch(/repeating-linear-gradient/); // padrão listrado: distinção sem depender de cor
    expect(chart).toMatch(/▲/);
  });

  it('a página de Finanças usa coluna única com largura máxima e gutter lateral', () => {
    const page = read('src/app/financas/page.tsx');
    expect(page).toMatch(/max-w-3xl/);
    expect(page).toMatch(/p-4 pb-24/);
    const cmp = read('src/app/financas/comparativo/page.tsx');
    expect(cmp).toMatch(/max-w-3xl/);
    expect(cmp).toMatch(/min-h-11/);
  });

  it('barras de progresso expõem valor e rótulo para tecnologias assistivas', () => {
    const parts = read('src/components/finance-cash/month-parts.tsx');
    const goal = read('src/components/finance-cash/goal-card.tsx');
    for (const src of [parts, goal]) {
      expect(src).toMatch(/role="progressbar"/);
      expect(src).toMatch(/aria-valuenow/);
    }
    expect(goal).toMatch(/aria-valuetext/);
  });
});

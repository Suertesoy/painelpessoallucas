// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  totalIncomeCents,
  totalExpenseCents,
  monthResultCents,
  totalFinancialPositionCents,
  computeCategoryBreakdown,
  compareWithPreviousMonth,
} from '@/modules/finance/domain/analytics';
import { expenseContributionCents } from '@/modules/finance/domain/money';

describe('analytics: renda, gastos e resultado do mês (centavos inteiros)', () => {
  const income = { matheusIncomeCents: 500000, lucasIncomeCents: 320000, otherIncomeCents: 10000 };

  it('renda total soma os três valores manuais', () => {
    expect(totalIncomeCents(income)).toBe(830000);
  });

  it('gastos somam apenas purchase/fee (absoluto) menos refund', () => {
    const transactions = [
      { categoryId: 'c1', nature: 'purchase' as const, amountCents: -4590 },
      { categoryId: 'c1', nature: 'fee' as const, amountCents: -1000 },
      { categoryId: 'c2', nature: 'refund' as const, amountCents: 2000 },
      { categoryId: 'c3', nature: 'transfer' as const, amountCents: -100000 },
      { categoryId: 'c3', nature: 'invoice_payment' as const, amountCents: -200000 },
      { categoryId: 'c3', nature: 'unidentified_credit' as const, amountCents: 50000 },
      { categoryId: 'c3', nature: 'ignored' as const, amountCents: -99999 },
    ];
    expect(totalExpenseCents(transactions)).toBe(4590 + 1000 - 2000);
  });

  it('resultado do mês = renda total - gastos confirmados', () => {
    const transactions = [{ categoryId: 'c1', nature: 'purchase' as const, amountCents: -30000 }];
    expect(monthResultCents(income, transactions)).toBe(830000 - 30000);
  });

  it('total financeiro = disponível + guardado, sem somar a renda de novo', () => {
    expect(totalFinancialPositionCents({ availableCashCents: 150000, savedCashCents: 900000 })).toBe(1050000);
  });
});

describe('analytics: contribuição por natureza (dupla contagem)', () => {
  it('compra no cartão (saída negativa) aumenta o gasto pelo valor absoluto', () => {
    expect(expenseContributionCents('purchase', -4590)).toBe(4590);
  });

  it('pagamento de fatura não conta como gasto novo', () => {
    expect(expenseContributionCents('invoice_payment', -200000)).toBe(0);
  });

  it('transferência é excluída dos gastos', () => {
    expect(expenseContributionCents('transfer', -50000)).toBe(0);
  });

  it('tarifa bancária pode ser despesa', () => {
    expect(expenseContributionCents('fee', -1500)).toBe(1500);
  });

  it('crédito não identificado não vira gasto nem renda', () => {
    expect(expenseContributionCents('unidentified_credit', 30000)).toBe(0);
  });

  it('estorno reduz o gasto da categoria quando classificado', () => {
    expect(expenseContributionCents('refund', 2000)).toBe(-2000);
  });

  it('linha ignorada não participa de nenhum cálculo', () => {
    expect(expenseContributionCents('ignored', -99999)).toBe(0);
  });
});

describe('analytics: gastos por categoria', () => {
  it('calcula total e percentual por categoria, estorno reduzindo a própria categoria', () => {
    const categoryNames = new Map([
      ['mercado-id', 'Mercado'],
      ['saude-id', 'Saúde'],
    ]);
    const transactions = [
      { categoryId: 'mercado-id', nature: 'purchase' as const, amountCents: -30000 },
      { categoryId: 'mercado-id', nature: 'refund' as const, amountCents: 5000 },
      { categoryId: 'saude-id', nature: 'purchase' as const, amountCents: -25000 },
    ];
    const breakdown = computeCategoryBreakdown(transactions, categoryNames);
    const mercado = breakdown.find((b) => b.categoryId === 'mercado-id')!;
    const saude = breakdown.find((b) => b.categoryId === 'saude-id')!;
    expect(mercado.totalCents).toBe(25000);
    expect(saude.totalCents).toBe(25000);
    expect(mercado.percentage).toBe(50);
    expect(saude.percentage).toBe(50);
  });
});

describe('analytics: comparação com o mês anterior', () => {
  it('gera texto determinístico quando os gastos aumentaram', () => {
    const result = compareWithPreviousMonth(50000, 40000);
    expect(result.deltaCents).toBe(10000);
    expect(result.text).toContain('aumentaram');
    expect(result.text).toContain('R$');
  });

  it('gera texto determinístico quando os gastos diminuíram', () => {
    const result = compareWithPreviousMonth(30000, 40000);
    expect(result.deltaCents).toBe(-10000);
    expect(result.text).toContain('diminuíram');
  });

  it('ausência de dado do mês anterior produz um estado honesto, não uma comparação vazia', () => {
    const result = compareWithPreviousMonth(30000, null);
    expect(result.deltaCents).toBeNull();
    expect(result.text).toBe('Não há dados suficientes do mês anterior para comparação.');
  });
});

// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  projectCash,
  type CommitmentInput,
  type FixedIncomeInput,
  type InvoiceInput,
  type ProjectionInput,
} from '@/modules/finance/cash/domain/projection';
import { estimateCardSpending } from '@/modules/finance/cash/domain/card-estimate';

const TODAY = '2026-10-15';

const monthly = (id: string, description: string, amountCents: number, dayOfMonth: number, startMonth: string): CommitmentInput => ({
  id, description, amountCents, recurrence: 'monthly', dueDate: null, dayOfMonth, startMonth, endMonth: null,
  billing: 'direct', card: null, active: true,
});
const income = (id: string, description: string, amountCents: number, dayOfMonth: number, startMonth: string, endMonth: string | null = null): FixedIncomeInput => ({
  id, description, amountCents, dayOfMonth, startMonth, endMonth, active: true,
});
const inv = (id: string, card: 'nubank_1' | 'nubank_2', month: string, amountCents: number, status: InvoiceInput['status'] = 'open'): InvoiceInput => ({
  id, card, month, status, amountCents, dueDate: `${month}-28`,
});

/** Cenário real auditado (out/2026 → jan/2027), valores em centavos. */
function household(over: Partial<ProjectionInput> = {}): ProjectionInput {
  return {
    today: TODAY,
    months: 4,
    availableCents: 405000, // a reserva (900000) nunca é passada ao motor
    receivables: [],
    fixedIncomes: [income('matheus', 'Salário Matheus', 460000, 1, '2026-11'), income('gabriel', 'Pagamento Gabriel', 100000, 25, '2026-10')],
    commitments: [
      monthly('rent', 'Aluguel', 270000, 7, '2026-11'),
      monthly('condo', 'Condominio', 70000, 7, '2026-11'),
      monthly('psi', 'Psicólogo', 30000, 15, '2026-10'),
    ],
    occurrences: [],
    invoices: [
      inv('a10', 'nubank_1', '2026-10', 130049), inv('a11', 'nubank_1', '2026-11', 39704), inv('a12', 'nubank_1', '2026-12', 32504), inv('a01', 'nubank_1', '2027-01', 22522),
      inv('b11', 'nubank_2', '2026-11', 210337), inv('b12', 'nubank_2', '2026-12', 51264), inv('b01', 'nubank_2', '2027-01', 23779),
    ],
    linkedCommitmentMonths: new Set(),
    ...over,
  };
}

describe('projeção doméstica: aluguel e condomínio mensais', () => {
  it('aluguel e condomínio entram em todos os meses a partir do início, sem término', () => {
    const p = projectCash(household());
    expect(p.map((m) => m.directLines.map((l) => l.label).sort())).toEqual([
      ['Psicólogo'],
      ['Aluguel', 'Condominio', 'Psicólogo'],
      ['Aluguel', 'Condominio', 'Psicólogo'],
      ['Aluguel', 'Condominio', 'Psicólogo'],
    ]);
  });

  it('janeiro/2027 = acumulado anterior + entradas − compromissos − faturas (sem duplicar)', () => {
    const p = projectCash(household());
    expect(p.map((m) => m.resultCents)).toEqual([344951, 284910, 391142, 534841]);
    const jan = p[3];
    expect(jan.openingCents).toBe(391142); // vem do resultado de dezembro
    expect(jan.fixedIncomeCents).toBe(560000);
    expect(jan.directCents).toBe(370000);
    expect(jan.invoicesCents).toBe(46301);
    // fluxo do mês (entrou − saiu) é diferente do acumulado ao fim do mês
    expect(jan.inflowCents - jan.committedCents).toBe(143699);
    expect(jan.resultCents - jan.openingCents).toBe(143699);
  });

  it('a reserva fica fora: o resultado só muda com o saldo disponível', () => {
    const a = projectCash(household({ availableCents: 405000 }));
    const b = projectCash(household({ availableCents: 305000 }));
    expect(a[3].resultCents - b[3].resultCents).toBe(100000);
  });

  it('entrada fixa já recebida sai da conta (não soma de novo) e a cancelada não entra', () => {
    const p = projectCash(household({
      incomeOccurrences: [
        { incomeId: 'gabriel', month: '2026-10', amountCents: null, status: 'received' },
        { incomeId: 'matheus', month: '2026-12', amountCents: null, status: 'cancelled' },
      ],
    }));
    expect(p[0].fixedIncomeCents).toBe(0);
    expect(p[2].fixedIncomeCents).toBe(100000);
    expect(p[1].fixedIncomeCents).toBe(560000);
  });

  it('término opcional: sem data final continua; com último mês é inclusivo', () => {
    const open = projectCash(household({ fixedIncomes: [income('x', 'Contrato', 100000, 5, '2026-10')] }));
    expect(open.map((m) => m.fixedIncomeCents)).toEqual([100000, 100000, 100000, 100000]);
    const ended = projectCash(household({ fixedIncomes: [income('x', 'Contrato', 100000, 5, '2026-10', '2026-11')] }));
    expect(ended.map((m) => m.fixedIncomeCents)).toEqual([100000, 100000, 0, 0]);
  });

  it('déficit é carregado para o mês seguinte', () => {
    const p = projectCash(household({ availableCents: 0, fixedIncomes: [], commitments: [monthly('r', 'Aluguel', 100000, 7, '2026-11')], invoices: [] }));
    expect(p.map((m) => m.resultCents)).toEqual([0, -100000, -200000, -300000]);
    expect(p[3].needCents).toBe(300000);
  });

  it('avisa possível duplicidade entre recebimento pontual e entrada fixa de mesmo nome', () => {
    const p = projectCash(household({
      receivables: [{ id: 'r', description: 'Pagamento Gabriel outubro', amountCents: 99999, expectedDate: '2026-10-25', status: 'confirmed' }],
    }));
    expect(p[0].warnings.some((w) => w.includes('parece repetir'))).toBe(true);
  });
});

describe('estimativa opcional de cartão', () => {
  const past = (card: 'nubank_1' | 'nubank_2', amounts: number[]) =>
    amounts.map((a, i) => inv(`h-${card}-${i}`, card, `2026-0${7 + i}`, a, 'paid'));

  it('com poucas faturas históricas não inventa valor', () => {
    const p = projectCash(household());
    const e = estimateCardSpending(household().invoices, p, '2026-10');
    expect(e.enough).toBe(false);
    expect(e.months.every((m) => m.cents === 0)).toBe(true);
    expect(e.insufficientCards).toEqual(['nubank_1', 'nubank_2']);
  });

  it('usa a média e desconta o que a fatura do mês já soma (não duplica)', () => {
    const invoices = [...household().invoices, ...past('nubank_1', [200000, 220000, 180000])];
    const p = projectCash(household({ invoices }));
    const e = estimateCardSpending(invoices, p, '2026-10');
    expect(e.enough).toBe(true);
    expect(e.byCard).toEqual([{ card: 'nubank_1', averageCents: 200000, basedOnInvoices: 3 }]);
    // out: média 2000,00 − fatura já somada 1300,49 ; nov: 2000,00 − 397,04
    expect(e.months[0].cents).toBe(200000 - 130049);
    expect(e.months[1].cents).toBe(200000 - 39704);
    expect(e.months[1].cumulativeCents).toBe(200000 - 130049 + 200000 - 39704);
    // nubank_2 não tem histórico: fica fora, sem valor inventado
    expect(e.insufficientCards).toEqual(['nubank_2']);
  });

  it('fatura fechada ou paga é definitiva: estimativa zero naquele mês', () => {
    const invoices = [
      ...past('nubank_1', [200000, 200000, 200000]),
      inv('c10', 'nubank_1', '2026-10', 150000, 'closed'),
    ];
    const p = projectCash(household({ invoices }));
    const e = estimateCardSpending(invoices, p, '2026-10');
    expect(e.months[0].cents).toBe(0);
    expect(e.months[1].cents).toBe(200000); // sem fatura em novembro
  });

  it('fixos no cartão ainda sem fatura são descontados da estimativa', () => {
    const streaming: CommitmentInput = { ...monthly('s', 'Streaming', 5000, 9, '2026-11'), billing: 'card', card: 'nubank_1' };
    const invoices = past('nubank_1', [200000, 200000, 200000]);
    const p = projectCash(household({ commitments: [streaming], invoices }));
    const e = estimateCardSpending(invoices, p, '2026-10');
    expect(e.months[1].cents).toBe(200000 - 5000);
  });
});

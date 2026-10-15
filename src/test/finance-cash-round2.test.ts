// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CARD_FULL_LABELS, CARD_LABELS } from '@/modules/finance/cash/domain/month';
import {
  categoryLabel, isTechOrProfessional, merchantKey, purposeLabel, suggestClassification, type ClassifiableItem,
} from '@/modules/finance/cash/domain/categories';
import { parseNubankInvoiceCsv } from '@/modules/finance/cash/domain/nubank-invoice-csv';
import {
  projectCash, type FixedIncomeInput, type IncomeOccurrenceInput, type InvoiceInput, type ProjectionInput,
} from '@/modules/finance/cash/domain/projection';

import { EMPTY_FILTER, filterSpending, summarizeSpending, type SpendingRow } from '@/modules/finance/cash/domain/spending';

const TODAY = '2026-10-15';
const base = (o: Partial<ProjectionInput> = {}): ProjectionInput => ({
  today: TODAY, months: 8, availableCents: 0, receivables: [], commitments: [], occurrences: [], invoices: [],
  linkedCommitmentMonths: new Set(), ...o,
});
const income = (o: Partial<FixedIncomeInput> = {}): FixedIncomeInput => ({
  id: 'inc', description: 'Manutenção Cliente A', amountCents: 50000, dayOfMonth: 10,
  startMonth: '2026-10', endMonth: '2027-03', active: true, ...o,
});
const inv = (o: Partial<InvoiceInput> = {}): InvoiceInput => ({
  id: 'i1', card: 'nubank_2', month: '2026-11', status: 'open', amountCents: 1000, dueDate: '2026-11-08', ...o,
});

describe('cartões: Lucas e Matheus (identificadores internos preservados)', () => {
  it('apresenta nubank_1 como Lucas e nubank_2 como Matheus', () => {
    expect(CARD_LABELS).toEqual({ nubank_1: 'Lucas', nubank_2: 'Matheus' });
    expect(CARD_FULL_LABELS).toEqual({ nubank_1: 'Lucas · Nubank', nubank_2: 'Matheus · Nubank' });
  });
  it('a projeção e os avisos usam os novos nomes, sem alterar valores', () => {
    const [, nov] = projectCash(base({ months: 2, invoices: [inv({ amountCents: 21033700 }), inv({ id: 'i2', card: 'nubank_1', amountCents: null, month: '2026-11' })] }));
    expect(nov.invoiceLines.map((l) => l.label).sort()).toEqual(['Fatura Lucas · Nubank', 'Fatura Matheus · Nubank']);
    expect(nov.invoicesCents).toBe(21033700);
    expect(nov.warnings.join(' ')).toContain('Lucas · Nubank');
    expect(nov.warnings.join(' ')).not.toMatch(/Nubank [12]/);
  });
});

describe('categorias e finalidades', () => {
  const item = (id: string, desc: string, category: string | null = null, purpose: string | null = null): ClassifiableItem => ({
    id, key: merchantKey(desc), category, purpose,
  });
  it('rótulos', () => {
    expect(categoryLabel('ai')).toBe('Inteligência artificial');
    expect(categoryLabel(null)).toBe('Sem categoria');
    expect(purposeLabel(null)).toBe('Não classificada');
    expect(purposeLabel('professional')).toBe('Profissional');
  });
  it('sugere categoria por regra, mas nunca a finalidade', () => {
    const s = suggestClassification(item('1', 'Vercel Inc.'), []);
    expect(s).toEqual({ category: 'infrastructure', purpose: null, source: 'rule' });
    expect(suggestClassification(item('1', 'Netflix.Com'), [])?.category).toBe('streaming');
  });
  it('estabelecimento ambíguo fica sem sugestão ("a confirmar")', () => {
    expect(suggestClassification(item('1', 'Apple.Com/Bill'), [])).toBeNull();
  });
  it('histórico confirmado do mesmo estabelecimento tem prioridade e traz a finalidade', () => {
    const all = [item('a', 'Vercel Inc.', 'infrastructure', 'professional'), item('b', 'Vercel Inc.')];
    expect(suggestClassification(all[1], all)).toEqual({ category: 'infrastructure', purpose: 'professional', source: 'history' });
  });
  it('histórico conflitante não gera sugestão de histórico', () => {
    const all = [item('a', 'Apple.Com/Bill', 'software'), item('b', 'Apple.Com/Bill', 'subscriptions'), item('c', 'Apple.Com/Bill')];
    expect(suggestClassification(all[2], all)).toBeNull();
  });
  it('item já totalmente classificado não recebe sugestão', () => {
    expect(suggestClassification(item('1', 'Vercel Inc.', 'infrastructure', 'professional'), [])).toBeNull();
  });
  it('tecnologia e profissional: categoria de tecnologia OU finalidade profissional', () => {
    expect(isTechOrProfessional({ category: 'ai', purpose: null })).toBe(true);
    expect(isTechOrProfessional({ category: 'groceries', purpose: 'professional' })).toBe(true);
    expect(isTechOrProfessional({ category: 'groceries', purpose: 'household' })).toBe(false);
    expect(isTechOrProfessional({ category: null, purpose: null })).toBe(false);
  });
  it('parcela da mesma compra compartilha a chave do estabelecimento', () => {
    const { rows } = parseNubankInvoiceCsv('date,title,amount\n2026-10-01,Loja X - Parcela 1/3,"10,00"\n2026-11-01,Loja X - Parcela 2/3,"10,00"');
    expect(merchantKey(rows[0].baseDescription)).toBe(merchantKey(rows[1].baseDescription));
  });
});

const DIR = path.resolve(__dirname, '../../fixtures-privadas');
const REAL = ['Nubank_2026-09-28.csv', 'Nubank_2026-10-28.csv', 'Nubank_2026-11-28.csv'].map((f) => path.join(DIR, f));
describe.skipIf(!REAL.every(existsSync))('descrições reais do cartão Lucas (fixtures-privadas)', () => {
  const rows = REAL.flatMap((f) => parseNubankInvoiceCsv(readFileSync(f, 'utf-8')).rows).filter((r) => r.kind === 'purchase');
  const suggestionFor = (needle: string) => {
    const r = rows.find((x) => x.normalizedDescription.includes(needle));
    return r ? suggestClassification({ key: merchantKey(r.baseDescription), category: null, purpose: null }, []) : undefined;
  };
  it('reconhece as descrições a revisar como sugestão (sem classificar sozinho)', () => {
    expect(suggestionFor('vercel')?.category).toBe('infrastructure');
    expect(suggestionFor('magnific')?.category).toBe('ai');
    expect(suggestionFor('google one')?.category).toBe('software');
    expect(suggestionFor('g1ai')?.category).toBe('ai');
    expect(suggestionFor('workana')?.category).toBe('software');
    // Apple.Com/Bill: ambíguo -> sem sugestão. Finalidade nunca é presumida.
    expect(suggestionFor('apple com bill')).toBeNull();
    for (const needle of ['vercel', 'magnific', 'google one', 'workana']) expect(suggestionFor(needle)?.purpose).toBeNull();
  });
});

describe('entradas fixas', () => {
  it('aparece de outubro a março, inclusive, e não em abril', () => {
    const p = projectCash(base({ fixedIncomes: [income()] }));
    const months = p.filter((m) => m.fixedIncomeCents > 0).map((m) => m.month);
    expect(months).toEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
    expect(p.find((m) => m.month === '2027-04')?.fixedIncomeCents).toBe(0);
  });
  it('sem término continua nos meses futuros', () => {
    const p = projectCash(base({ months: 12, fixedIncomes: [income({ endMonth: null })] }));
    expect(p.every((m) => m.fixedIncomeCents === 50000)).toBe(true);
  });
  it('mês de início futuro só começa nele', () => {
    const p = projectCash(base({ months: 4, fixedIncomes: [income({ startMonth: '2026-12' })] }));
    expect(p.map((m) => m.fixedIncomeCents)).toEqual([0, 0, 50000, 50000]);
  });
  it('soma ao resultado e o saldo inicial é a base', () => {
    const [m] = projectCash(base({ availableCents: 10000, fixedIncomes: [income()] }));
    expect(m.inflowCents).toBe(50000);
    expect(m.resultCents).toBe(60000);
  });
  it('exceção de um mês altera só aquele mês', () => {
    const occ: IncomeOccurrenceInput[] = [{ incomeId: 'inc', month: '2026-12', amountCents: 70000, status: 'pending' }];
    const p = projectCash(base({ fixedIncomes: [income()], incomeOccurrences: occ }));
    expect(p.map((m) => m.fixedIncomeCents).slice(0, 4)).toEqual([50000, 50000, 70000, 50000]);
  });
  it('recebida não soma de novo (o dinheiro já está no saldo) e cancelada não conta', () => {
    const occ: IncomeOccurrenceInput[] = [
      { incomeId: 'inc', month: '2026-10', amountCents: null, status: 'received' },
      { incomeId: 'inc', month: '2026-11', amountCents: null, status: 'cancelled' },
    ];
    const p = projectCash(base({ fixedIncomes: [income()], incomeOccurrences: occ }));
    expect(p[0].fixedIncomeCents).toBe(0);
    expect(p[1].fixedIncomeCents).toBe(0);
    expect(p[2].fixedIncomeCents).toBe(50000);
  });
  it('ocorrência pendente de mês anterior entra como atrasada no mês atual', () => {
    const [m] = projectCash(base({ fixedIncomes: [income({ startMonth: '2026-09' })] }));
    expect(m.fixedIncomeLines).toHaveLength(2);
    expect(m.fixedIncomeLines.some((l) => l.overdue)).toBe(true);
    expect(m.fixedIncomeCents).toBe(100000);
  });
  it('entrada encerrada (inativa) some da projeção, mas as recebidas continuam registradas', () => {
    const p = projectCash(base({ fixedIncomes: [income({ active: false })] }));
    expect(p.every((m) => m.fixedIncomeCents === 0)).toBe(true);
  });
  it('preserva a regra de déficit acumulado com entradas fixas', () => {
    const p = projectCash(base({
      months: 3, availableCents: 0, fixedIncomes: [income({ amountCents: 10000 })],
      invoices: [inv({ month: '2026-10', amountCents: 30000 })],
    }));
    expect(p[0].resultCents).toBe(-20000);
    expect(p[1].openingCents).toBe(-20000);
    expect(p[1].resultCents).toBe(-10000);
    expect(p[2].resultCents).toBe(0);
  });
  it('sinaliza (sem remover) recebimento pontual que parece repetir a entrada fixa', () => {
    const [m] = projectCash(base({
      fixedIncomes: [income()],
      receivables: [{ id: 'r', description: 'Manutenção outubro', amountCents: 50000, expectedDate: '2026-10-20', status: 'confirmed' }],
    }));
    expect(m.warnings.join(' ')).toContain('parece repetir a entrada fixa');
    expect(m.receiptsCents).toBe(50000); // continua somado: quem decide é o usuário
  });
  it('recebimento pontual diferente não gera aviso', () => {
    const [m] = projectCash(base({
      fixedIncomes: [income()],
      receivables: [{ id: 'r', description: 'Diária mergulho', amountCents: 123400, expectedDate: '2026-10-20', status: 'confirmed' }],
    }));
    expect(m.warnings).toEqual([]);
  });
});

describe('consulta de gastos', () => {
  const row = (o: Partial<SpendingRow>): SpendingRow => ({
    id: 'x', card: 'nubank_1', invoiceMonth: '2026-10', date: '2026-10-01', description: 'd', amountCents: 1000,
    kind: 'purchase', status: 'active', category: null, purpose: null, ...o,
  });
  const rows = [
    row({ id: '1', category: 'infrastructure', purpose: 'professional', amountCents: 10000 }),
    row({ id: '2', category: 'ai', purpose: null, amountCents: 5000, card: 'nubank_2', invoiceMonth: '2026-11' }),
    row({ id: '3', category: 'groceries', purpose: 'household', amountCents: 20000 }),
    row({ id: '4', amountCents: 700 }),
    row({ id: '5', kind: 'payment', amountCents: -256537 }),
    row({ id: '6', status: 'removed', amountCents: 999 }),
    row({ id: '7', kind: 'refund', category: 'ai', amountCents: -288 }),
  ];
  it('pagamentos de fatura e removidos nunca entram', () => {
    const all = filterSpending(rows, EMPTY_FILTER);
    expect(all.map((r) => r.id)).toEqual(['1', '2', '3', '4', '7']);
    expect(summarizeSpending(all).totalCents).toBe(10000 + 5000 + 20000 + 700 - 288);
  });
  it('tecnologia e profissional: IA + infraestrutura + finalidade profissional, com estorno abatendo', () => {
    const tech = filterSpending(rows, { ...EMPTY_FILTER, techOrProfessional: true });
    expect(tech.map((r) => r.id)).toEqual(['1', '2', '7']);
    const s = summarizeSpending(tech);
    expect(s.totalCents).toBe(10000 + 5000 - 288);
    expect(s.byCard.map((g) => [g.key, g.cents])).toEqual([['nubank_1', 9712], ['nubank_2', 5000]]);
    expect(s.byMonth.map((g) => g.key)).toEqual(['2026-10', '2026-11']);
  });
  it('filtros por cartão, mês, sem categoria e sem finalidade', () => {
    expect(filterSpending(rows, { ...EMPTY_FILTER, card: 'nubank_2' }).map((r) => r.id)).toEqual(['2']);
    expect(filterSpending(rows, { ...EMPTY_FILTER, month: '2026-11' }).map((r) => r.id)).toEqual(['2']);
    expect(filterSpending(rows, { ...EMPTY_FILTER, category: 'none' }).map((r) => r.id)).toEqual(['4']);
    expect(filterSpending(rows, { ...EMPTY_FILTER, purpose: 'none' }).map((r) => r.id)).toEqual(['2', '4', '7']);
  });
  it('conta lançamentos sem classificação completa', () => {
    expect(summarizeSpending(filterSpending(rows, EMPTY_FILTER)).unclassifiedCount).toBe(3);
  });
  it('classificar não muda valores: o total é o mesmo antes e depois', () => {
    const before = summarizeSpending(filterSpending(rows, EMPTY_FILTER)).totalCents;
    const classified = rows.map((r) => ({ ...r, category: 'other', purpose: 'personal' }));
    expect(summarizeSpending(filterSpending(classified, EMPTY_FILTER)).totalCents).toBe(before);
  });
});

describe('classificação não altera finanças nem é perdida na reimportação', () => {
  const sqlCore = readFileSync(path.resolve(__dirname, '../../supabase/migrations/20260815100000_finance_cash_core.sql'), 'utf-8');
  it('a função de importação nunca escreve categoria nem finalidade', () => {
    const fn = sqlCore.slice(sqlCore.indexOf('function public.finance_apply_invoice_import'), sqlCore.indexOf('function public.finance_resolve_missing_item'));
    expect(fn).not.toMatch(/\bcategory\b/);
    expect(fn).not.toMatch(/\bpurpose\b/);
  });
});

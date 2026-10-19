// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  projectCash, type CommitmentInput, type FixedIncomeInput, type InvoiceInput, type ProjectionInput,
} from '@/modules/finance/cash/domain/projection';
import { estimateCardSpending } from '@/modules/finance/cash/domain/card-estimate';
import { averageUnavailableReason, buildSustainability, staleUnpaidInvoices } from '@/modules/finance/cash/domain/sustainability';
import { SupabaseFinanceCashRepository } from '@/modules/finance/cash/infrastructure/supabase-finance-cash.repository';
import { FinanceCashCommands } from '@/modules/finance/cash/application/finance-cash.commands';
import { ChangeNotifier } from '@/platform/supabase/change-notifier';
import { todayDateStr } from '@/lib/dates';

const TODAY = '2026-10-16';

const monthly = (id: string, description: string, amountCents: number, startMonth: string, over: Partial<CommitmentInput> = {}): CommitmentInput => ({
  id, description, amountCents, recurrence: 'monthly', dueDate: null, dayOfMonth: 7, startMonth, endMonth: null,
  billing: 'direct', card: null, active: true, ...over,
});
const income = (id: string, description: string, amountCents: number, startMonth: string): FixedIncomeInput => ({
  id, description, amountCents, dayOfMonth: 5, startMonth, endMonth: null, active: true,
});
const inv = (id: string, card: 'nubank_1' | 'nubank_2', month: string, amountCents: number | null, status: InvoiceInput['status']): InvoiceInput => ({
  id, card, month, status, amountCents, dueDate: `${month}-10`,
});

/** Histórico real de três meses fechados/pagos por cartão: médias 4.000,00 (Lucas) e 3.740,31 (Matheus) = 7.740,31. */
const HISTORY: InvoiceInput[] = [
  inv('l7', 'nubank_1', '2026-07', 400000, 'paid'), inv('l8', 'nubank_1', '2026-08', 400000, 'paid'), inv('l9', 'nubank_1', '2026-09', 400000, 'closed'),
  inv('m7', 'nubank_2', '2026-07', 374031, 'paid'), inv('m8', 'nubank_2', '2026-08', 374031, 'paid'), inv('m9', 'nubank_2', '2026-09', 374031, 'paid'),
];

function scenario(over: Partial<ProjectionInput> = {}): ProjectionInput {
  return {
    today: TODAY,
    months: 4,
    availableCents: 500000,
    receivables: [],
    // Entradas cadastradas: R$ 6.100,00/mês a partir de novembro.
    fixedIncomes: [income('a', 'Salário Matheus', 460000, '2026-11'), income('b', 'Pagamento Gabriel', 150000, '2026-11')],
    // Compromissos diretos: R$ 3.700,00/mês.
    commitments: [monthly('rent', 'Aluguel', 270000, '2026-10'), monthly('condo', 'Condomínio', 70000, '2026-10'), monthly('psi', 'Psicólogo', 30000, '2026-10')],
    occurrences: [],
    invoices: [...HISTORY],
    linkedCommitmentMonths: new Set(),
    ...over,
  };
}

function run(over: Partial<ProjectionInput> = {}) {
  const input = scenario(over);
  const projection = projectCash(input);
  const estimate = estimateCardSpending(input.invoices, projection, '2026-10');
  const sustainability = buildSustainability({
    today: input.today, months: input.months, receivables: input.receivables, fixedIncomes: input.fixedIncomes ?? [],
    incomeOccurrences: input.incomeOccurrences ?? [], commitments: input.commitments, occurrences: input.occurrences,
    invoices: input.invoices, projection, estimate,
  });
  return { input, projection, estimate, sustainability };
}

describe('média dos cartões: só faturas completas e reais', () => {
  it('média das 3 últimas faturas fechadas/pagas de cada cartão (≈ R$ 7.740,31 somando os dois)', () => {
    const { estimate } = run();
    expect(estimate.byCard.map((c) => c.averageCents)).toEqual([400000, 374031]);
    expect(estimate.byCard.reduce((s, c) => s + c.averageCents, 0)).toBe(774031);
  });

  it('fatura ABERTA antiga (ex.: julho de R$ 6.265,12 esquecida como aberta) não entra na média', () => {
    const invoices = [
      inv('l6', 'nubank_1', '2026-06', 300000, 'paid'),
      inv('l7', 'nubank_1', '2026-07', 626512, 'open'),
      inv('l8', 'nubank_1', '2026-08', 300000, 'closed'),
      inv('l9', 'nubank_1', '2026-09', 300000, 'paid'),
    ];
    const { estimate } = run({ invoices });
    const lucas = estimate.byCard.find((c) => c.card === 'nubank_1');
    expect(lucas?.basedOnMonths).toEqual(['2026-09', '2026-08', '2026-06']);
    expect(lucas?.averageCents).toBe(300000);
  });

  it('depois de corrigir o status da fatura antiga para paga, ela passa a compor o histórico', () => {
    const invoices = [
      inv('l7', 'nubank_1', '2026-07', 626512, 'paid'),
      inv('l8', 'nubank_1', '2026-08', 300000, 'closed'),
      inv('l9', 'nubank_1', '2026-09', 300000, 'paid'),
    ];
    const { estimate } = run({ invoices });
    expect(estimate.byCard[0].basedOnMonths).toEqual(['2026-09', '2026-08', '2026-07']);
    expect(estimate.byCard[0].averageCents).toBe(Math.round((626512 + 300000 + 300000) / 3));
  });

  it('faturas de meses futuros e do mês atual nunca viram histórico', () => {
    const invoices = [
      inv('l8', 'nubank_1', '2026-08', 300000, 'paid'), inv('l9', 'nubank_1', '2026-09', 300000, 'paid'),
      inv('l10', 'nubank_1', '2026-10', 900000, 'closed'), inv('l11', 'nubank_1', '2026-11', 900000, 'paid'),
    ];
    const { estimate } = run({ invoices });
    expect(estimate.availableByCard.nubank_1).toBe(2);
    expect(estimate.insufficientCards).toContain('nubank_1');
  });

  it('menos de 3 meses confiáveis: mostra a limitação e não inventa média nem resultado', () => {
    const invoices = [inv('l9', 'nubank_1', '2026-09', 300000, 'paid'), inv('m9', 'nubank_2', '2026-09', 200000, 'paid')];
    const { estimate, sustainability } = run({ invoices });
    expect(estimate.enough).toBe(false);
    const nov = sustainability[1];
    expect(nov.averageResultCents).toBeNull();
    expect(nov.estimatedGapCents).toBe(0);
    expect(nov.unavailableCards).toEqual(['nubank_1', 'nubank_2']);
    expect(averageUnavailableReason(nov)).toMatch(/Sem média confiável/);
    // a leitura "conhecido" continua existindo
    expect(nov.knownResultCents).toBe(610000 - 370000);
  });
});

describe('fatura real × média no mês projetado', () => {
  it('fatura real completa (fechada/paga) substitui a média: nada é estimado por cima', () => {
    const invoices = [...HISTORY, inv('l11', 'nubank_1', '2026-11', 100000, 'closed'), inv('m11', 'nubank_2', '2026-11', 90000, 'paid')];
    const { sustainability } = run({ invoices });
    const nov = sustainability[1];
    expect(nov.cards.map((c) => c.kind)).toEqual(['real', 'real']);
    expect(nov.estimatedGapCents).toBe(0);
    expect(nov.invoicesCents).toBe(190000);
    expect(nov.averageResultCents).toBe(610000 - 370000 - 190000);
  });

  it('fatura aberta parcial: vale o já lançado e só a diferença até a média é estimada (sem média + fatura inteira)', () => {
    const invoices = [...HISTORY, inv('l11', 'nubank_1', '2026-11', 150000, 'open')];
    const { sustainability } = run({ invoices });
    const nov = sustainability[1];
    const lucas = nov.cards.find((c) => c.card === 'nubank_1');
    expect(lucas?.kind).toBe('partial');
    expect(lucas?.gapCents).toBe(400000 - 150000);
    // Lucas soma exatamente a média (4.000,00); Matheus, sem fatura, também a média
    expect(nov.invoicesCents + nov.estimatedGapCents).toBe(150000 + 250000 + 374031);
  });

  it('gasto fixo no cartão ainda sem fatura é descontado da estimativa (não conta duas vezes)', () => {
    const netflix = monthly('nf', 'Assinatura Streaming', 5000, '2026-11', { billing: 'card', card: 'nubank_1', dayOfMonth: 9 });
    const { sustainability } = run({ commitments: [...scenario().commitments, netflix] });
    const nov = sustainability[1];
    const lucas = nov.cards.find((c) => c.card === 'nubank_1');
    expect(lucas?.cardFixedCents).toBe(5000);
    expect(lucas?.gapCents).toBe(400000 - 5000);
    expect(nov.cardFixedCents + nov.invoicesCents + nov.estimatedGapCents).toBe(400000 + 374031);
  });

  it('gasto fixo já conciliado com a fatura (vinculado ao CSV) não é somado de novo', () => {
    const netflix = monthly('nf', 'Assinatura Streaming', 5000, '2026-11', { billing: 'card', card: 'nubank_1', dayOfMonth: 9 });
    const invoices = [...HISTORY, inv('l11', 'nubank_1', '2026-11', 120000, 'closed')];
    const { sustainability, projection } = run({
      commitments: [...scenario().commitments, netflix], invoices, linkedCommitmentMonths: new Set(['nf|nubank_1|2026-11']),
    });
    expect(projection[1].cardFixedLines[0].state).toBe('reconciled');
    expect(sustainability[1].cardFixedCents).toBe(0);
    expect(sustainability[1].cards.find((c) => c.card === 'nubank_1')?.invoiceCents).toBe(120000);
  });
});

describe('projeção mensal independente (sem carregar déficit hipotético)', () => {
  it('cada mês é calculado sozinho: o resultado de novembro não contamina dezembro', () => {
    const { sustainability } = run();
    const [, nov, dec, jan] = sustainability;
    // entradas 6.100 − diretos 3.700 − média combinada 7.740,31 = −5.340,31, em TODOS os meses (não acumula)
    expect(nov.averageResultCents).toBe(610000 - 370000 - 774031);
    expect(dec.averageResultCents).toBe(nov.averageResultCents);
    expect(jan.averageResultCents).toBe(nov.averageResultCents);
  });

  it('mudar só novembro (despesa extra) não altera dezembro', () => {
    const base = run().sustainability;
    const extra = monthly('x', 'Seguro anual', 100000, '2026-11', { recurrence: 'none', dueDate: '2026-11-20' });
    const changed = run({ commitments: [...scenario().commitments, extra] }).sustainability;
    expect(changed[1].knownResultCents).toBe(base[1].knownResultCents - 100000);
    expect(changed[2].knownResultCents).toBe(base[2].knownResultCents);
    expect(changed[3].averageResultCents).toBe(base[3].averageResultCents);
  });

  it('o caixa real acumulado continua separado: carrega o que está registrado, sem a hipótese da média', () => {
    const { projection, sustainability } = run();
    // O caixa real parte do saldo e encadeia só os valores REGISTRADOS (sem estimativa).
    expect(projection[1].openingCents).toBe(projection[0].resultCents);
    expect(projection[1].resultCents).toBe(projection[0].resultCents + 610000 - 370000);
    // Já a sustentabilidade de novembro ignora o saldo e o resultado de outubro.
    expect(sustainability[1].knownResultCents).toBe(610000 - 370000);
  });

  it('déficit REAL continua visível no caixa (não é escondido pela sustentabilidade)', () => {
    const { projection } = run({
      availableCents: 0,
      invoices: [...HISTORY, inv('o', 'nubank_1', '2026-10', 900000, 'closed')],
    });
    expect(projection[0].resultCents).toBeLessThan(0);
    expect(projection[0].needCents).toBeGreaterThan(0);
  });

  it('o mês inteiro conta: compromisso já pago e entrada já recebida seguem no resultado do mês', () => {
    const { sustainability } = run({
      occurrences: [{ commitmentId: 'rent', month: '2026-11', amountCents: null, status: 'paid' }],
      incomeOccurrences: [{ incomeId: 'a', month: '2026-11', amountCents: null, status: 'received' }],
    });
    const nov = sustainability[1];
    expect(nov.incomeCents).toBe(610000);
    expect(nov.directCents).toBe(370000);
    expect(nov.directLines.find((l) => l.label === 'Aluguel')?.done).toBe(true);
    expect(nov.incomeLines.find((l) => l.label === 'Salário Matheus')?.done).toBe(true);
  });
});

describe('meta para não usar a reserva', () => {
  it('limite combinado = entradas − compromissos diretos (R$ 6.100 − R$ 3.700 = R$ 2.400), um valor só da casa', () => {
    const { sustainability } = run();
    const l = sustainability[1].limit;
    expect(l.combinedCents).toBe(240000);
    expect(l.incomeBelowDirect).toBe(false);
    // Sem divisão proporcional entre Lucas e Matheus: não existe campo por cartão.
    expect(Object.keys(l).sort()).toEqual(['combinedCents', 'incomeBelowDirect', 'knownCardsCents', 'remainingCents']);
  });

  it('com ou sem média/histórico o limite combinado é o mesmo (não depende do consumo passado)', () => {
    const { sustainability } = run({ invoices: [] });
    expect(sustainability[1].limit.combinedCents).toBe(240000);
  });

  it('entradas insuficientes: não há limite e a reserva não é assumida como cobertura', () => {
    const { sustainability } = run({ fixedIncomes: [income('a', 'Salário', 200000, '2026-11')] });
    const l = sustainability[1].limit;
    expect(l.incomeBelowDirect).toBe(true);
    expect(l.combinedCents).toBe(0);
    expect(sustainability[1].knownResultCents).toBeLessThan(0);
  });

  it('o que já está lançado nos cartões acima do limite aparece como estouro, não some', () => {
    const invoices = [...HISTORY, inv('l11', 'nubank_1', '2026-11', 500000, 'closed')];
    const l = run({ invoices }).sustainability[1].limit;
    expect(l.knownCardsCents).toBe(500000);
    expect(l.remainingCents).toBe(240000 - 500000);
  });

  it('mês sem entrada cadastrada é sinalizado (nenhuma renda é inventada)', () => {
    const oct = run().sustainability[0];
    expect(oct.noIncomeRegistered).toBe(true);
    expect(oct.incomeCents).toBe(0);
  });
});

describe('sem contagem em dobro e pendências históricas', () => {
  it('compromisso "direto" com cara de fatura de cartão gera aviso de possível duplicidade', () => {
    const dup = monthly('dup', 'Fatura Nubank', 300000, '2026-11');
    const { sustainability } = run({ commitments: [...scenario().commitments, dup] });
    expect(sustainability[1].duplicateWarnings.join(' ')).toMatch(/Fatura Nubank/);
    expect(sustainability[1].duplicateWarnings.join(' ')).toMatch(/duas vezes/);
  });

  it('fatura paga conta no mês (uma vez) mas sai das pendências do caixa', () => {
    const invoices = [...HISTORY, inv('m10', 'nubank_2', '2026-10', 250000, 'paid'), inv('l10', 'nubank_1', '2026-10', 100000, 'closed')];
    const { projection, sustainability } = run({ invoices });
    const pending = projection[0].invoiceLines.map((l) => l.invoiceId);
    expect(pending).toContain('l10');
    expect(pending).not.toContain('m10'); // paga não é pendência
    expect(sustainability[0].invoicesCents).toBe(350000); // mas pertence ao mês
  });

  it('fatura antiga marcada como não paga é detectada (aberta ou fechada); paga não', () => {
    const invoices = [inv('old', 'nubank_1', '2026-07', 626512, 'open'), inv('old2', 'nubank_2', '2026-08', 1000, 'closed'), inv('ok', 'nubank_1', '2026-09', 1000, 'paid'), inv('cur', 'nubank_1', '2026-10', 1000, 'open')];
    expect(staleUnpaidInvoices(invoices, '2026-10').map((i) => i.id)).toEqual(['old', 'old2']);
  });

  it('o pagamento histórico (paga) tira a fatura antiga das pendências SEM mexer no saldo inicial', () => {
    const before = run({ invoices: [...HISTORY.filter((i) => i.id !== 'l7'), inv('l7', 'nubank_1', '2026-07', 626512, 'open')] });
    const after = run({ invoices: [...HISTORY.filter((i) => i.id !== 'l7'), inv('l7', 'nubank_1', '2026-07', 626512, 'paid')] });
    expect(before.projection[0].invoiceLines.some((l) => l.invoiceId === 'l7')).toBe(true);
    expect(after.projection[0].invoiceLines.some((l) => l.invoiceId === 'l7')).toBe(false);
    expect(before.projection[0].openingCents).toBe(after.projection[0].openingCents); // saldo informado intacto
    expect(after.projection[0].resultCents - before.projection[0].resultCents).toBe(626512);
  });

  it('fatura sem valor informado é sinalizada e não vira zero silencioso', () => {
    const { sustainability } = run({ invoices: [...HISTORY, inv('x', 'nubank_1', '2026-11', null, 'open')] });
    expect(sustainability[1].cards.find((c) => c.card === 'nubank_1')?.invoiceWithoutAmount).toBe(true);
  });
});

/** Cliente Supabase falso que registra cada escrita (tabela, patch e RPC). */
function fakeSupabase() {
  const writes: { table: string; patch: Record<string, unknown>; filters: [string, unknown][] }[] = [];
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    let patch: Record<string, unknown> = {};
    const filters: [string, unknown][] = [];
    chain.update = (p: Record<string, unknown>) => { patch = p; return chain; };
    chain.eq = (k: string, v: unknown) => { filters.push([k, v]); return chain; };
    chain.then = (resolve: (v: unknown) => unknown) => { writes.push({ table, patch, filters }); return resolve({ data: null, error: null }); };
    return chain;
  };
  const rpc = (fn: string, args: Record<string, unknown>) => { rpcs.push({ fn, args }); return Promise.resolve({ data: null, error: null }); };
  return { supabase: { from, rpc } as never, writes, rpcs };
}

function commandsWith() {
  const fake = fakeSupabase();
  const repo = new SupabaseFinanceCashRepository(fake.supabase, 'ws', new ChangeNotifier());
  const events: { type: string; payload?: unknown }[] = [];
  const eventRepo = { save: vi.fn(async (e: { type: string; payload?: unknown }) => { events.push(e); }) } as never;
  return { ...fake, events, cmds: new FinanceCashCommands(repo, eventRepo, 'ws') };
}

describe('situação da fatura: aberta, fechada, paga e correção', () => {
  it('abrir/fechar muda só a situação e limpa a data de pagamento', async () => {
    const { cmds, writes, rpcs } = commandsWith();
    await cmds.changeInvoiceStatus('inv1', 'closed');
    expect(writes).toHaveLength(1);
    expect(writes[0].table).toBe('finance_card_invoices');
    expect(writes[0].patch).toEqual({ status: 'closed', paid_at: null });
    expect(rpcs).toHaveLength(0);
  });

  it('pagamento HISTÓRICO: grava a data informada, não chama a função que mexe no saldo', async () => {
    const { cmds, writes, rpcs } = commandsWith();
    await cmds.changeInvoiceStatus('inv1', 'paid', { paidOn: '2026-07-12', deductFromBalance: false });
    expect(rpcs).toHaveLength(0); // saldo intocado
    expect(writes.map((w) => w.table)).toEqual(['finance_card_invoices']);
    expect(writes[0].patch.status).toBe('paid');
    expect(new Date(writes[0].patch.paid_at as string).getTime()).toBe(new Date('2026-07-12T00:00:00').getTime());
  });

  it('pagamento que MOVE o saldo: usa a função idempotente uma única vez e só então ajusta a data', async () => {
    const { cmds, writes, rpcs } = commandsWith();
    await cmds.changeInvoiceStatus('inv1', 'paid', { paidOn: todayDateStr(), deductFromBalance: true });
    expect(rpcs).toEqual([{ fn: 'finance_mark_invoice_paid', args: { p_invoice_id: 'inv1', p_deduct_from_balance: true } }]);
    expect(writes).toHaveLength(1);
    expect(writes[0].filters).toContainEqual(['status', 'paid']); // só ajusta a data de fatura já paga
    expect(Object.keys(writes[0].patch)).toEqual(['paid_at']);
  });

  it('o padrão (sem opções) é histórico: nunca desconta do saldo por engano', async () => {
    const { cmds, rpcs } = commandsWith();
    await cmds.changeInvoiceStatus('inv1', 'paid');
    expect(rpcs).toHaveLength(0);
  });

  it('corrigir uma fatura paga por engano: volta a aberta sem apagar nada nem mexer no saldo', async () => {
    const { cmds, writes, rpcs, events } = commandsWith();
    await cmds.changeInvoiceStatus('inv1', 'open');
    expect(rpcs).toHaveLength(0);
    expect(writes.map((w) => w.table)).toEqual(['finance_card_invoices']); // itens, saldo e importações intocados
    expect(writes[0].patch).toEqual({ status: 'open', paid_at: null });
    // a trilha de eventos não carrega valores
    expect(JSON.stringify(events)).not.toMatch(/amount|cents/i);
  });

  it('data de pagamento inválida ou no futuro é recusada antes de gravar', async () => {
    const { cmds, writes } = commandsWith();
    await expect(cmds.changeInvoiceStatus('inv1', 'paid', { paidOn: '2099-01-01' })).rejects.toThrow(/futuro/);
    await expect(cmds.changeInvoiceStatus('inv1', 'paid', { paidOn: 'ontem' })).rejects.toThrow(/válida/);
    expect(writes).toHaveLength(0);
  });
});

describe('importação e reimportação preservam a situação (garantias no SQL e no serviço)', () => {
  const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8');
  const sql = read('supabase/migrations/20260815100000_finance_cash_core.sql');

  it('a função de importação nunca altera uma fatura paga e, sem situação nova, mantém a atual', () => {
    expect(sql).toMatch(/when status = 'paid' then status\s+else coalesce\(p_new_status, status\)/);
  });

  it('a baixa por SQL é idempotente: fatura já paga retorna sem descontar de novo', () => {
    const body = sql.slice(sql.indexOf('create or replace function public.finance_mark_invoice_paid'));
    expect(body.slice(0, 900)).toMatch(/if v_inv\.status = 'paid' then\s+return v_inv;/);
  });

  it('o serviço recusa importar sobre fatura paga (não reseta a situação em silêncio)', () => {
    const svc = read('src/modules/finance/cash/infrastructure/invoice-import-service.ts');
    expect(svc).toMatch(/ctx\.invoice\?\.status === 'paid'/);
    expect(svc).toMatch(/invoice_paid/);
  });

  it('o pagamento reconhecido no CSV quita faturas anteriores sem mexer no saldo', () => {
    expect(sql).toMatch(/set status = 'paid', paid_at = coalesce\(paid_at, now\(\)\)/);
  });
});

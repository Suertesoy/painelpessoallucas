// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildMonthView, clampMonth, MAX_FUTURE_MONTHS, MAX_PAST_MONTHS } from '@/modules/finance/cash/domain/month-view';
import { resolveCardGoal, type CardGoal } from '@/modules/finance/cash/domain/card-goals';
import { addMonths } from '@/modules/finance/cash/domain/month';
import { commitment, item, L, novLucas, source } from './helpers-finance-month';

describe('navegação por mês', () => {
  it('abre no mês atual e identifica passado, atual e futuro (data local)', () => {
    expect(buildMonthView(source(), '2026-10').phase).toBe('current');
    expect(buildMonthView(source(), '2026-09').phase).toBe('past');
    expect(buildMonthView(source(), '2026-11').phase).toBe('future');
    expect(buildMonthView(source(), '2026-10').month).toBe('2026-10');
  });

  it('a navegação tem limites sensatos (não é infinita)', () => {
    expect(clampMonth(addMonths('2026-10', 200), '2026-10')).toBe(addMonths('2026-10', MAX_FUTURE_MONTHS));
    expect(clampMonth(addMonths('2026-10', -500), '2026-10')).toBe(addMonths('2026-10', -MAX_PAST_MONTHS));
    expect(buildMonthView(source(), '2099-01').month).toBe(addMonths('2026-10', MAX_FUTURE_MONTHS));
  });

  it('todas as seções mudam com o mês escolhido (entradas, compromissos, faturas, parcelas, meta, resultado)', () => {
    const goals: CardGoal[] = [
      { id: 'g1', scope: 'default', month: '2026-10', amountCents: 500000, updatedAt: null },
      { id: 'g2', scope: 'month', month: '2026-11', amountCents: 800000, updatedAt: null },
    ];
    const oct = buildMonthView(source({ goals }), '2026-10');
    const nov = buildMonthView(source({ goals }), '2026-11');
    const dec = buildMonthView(source({ goals }), '2026-12');

    expect(oct.incomeFixed.map((e) => e.state)).toEqual(['done', 'pending']); // salário recebido, pagamento previsto
    expect(nov.incomeFixed.map((e) => e.state)).toEqual(['pending', 'pending']);
    expect(oct.commitmentsDirect.filter((e) => !e.carriedOver).map((e) => e.state).sort()).toEqual(['done', 'done', 'pending']);
    expect(nov.commitmentsDirect.map((e) => e.state)).toEqual(['pending', 'pending', 'pending']);
    expect(oct.cards.map((c) => c.invoice?.status)).toEqual(['closed', 'paid']);
    expect(nov.cards.map((c) => c.invoice?.status)).toEqual(['open', undefined]);
    expect(dec.cards.map((c) => c.invoice)).toEqual([null, null]);
    expect(oct.installmentsLaunched.map((i) => i.description).sort()).toEqual(['Cadeira', 'Notebook']);
    expect(nov.installmentsLaunched.map((i) => i.description)).toEqual(['Notebook']);
    expect(oct.goal.resolved?.amountCents).toBe(500000);
    expect(nov.goal.resolved?.amountCents).toBe(800000);
    expect(dec.goal.resolved?.amountCents).toBe(500000);
    expect(oct.sustainability.knownResultCents).not.toBe(nov.sustainability.knownResultCents);
    expect([oct.sustainability.month, nov.sustainability.month, dec.sustainability.month]).toEqual(['2026-10', '2026-11', '2026-12']);
  });

  it('mês sem nenhum lançamento: estrutura idêntica, tudo vazio e sem inventar valores', () => {
    const empty = buildMonthView(source({ fixedIncomes: [], commitments: [], occurrences: [], incomeOccurrences: [], invoices: [], items: [] }), '2026-05');
    expect(empty.phase).toBe('past');
    expect(empty.incomeFixed).toEqual([]);
    expect(empty.commitmentsDirect).toEqual([]);
    expect(empty.cards.map((c) => c.completeness)).toEqual(['none', 'none']);
    expect(empty.sustainability.knownResultCents).toBe(0);
    expect(empty.sustainability.noIncomeRegistered).toBe(true);
    expect(empty.goal.resolved).toBeNull();
    expect(empty.goal.spentCents).toBe(0);
    expect(empty.cash).toBeNull();
    // futuro vazio também é válido
    const futureEmpty = buildMonthView(source({ fixedIncomes: [], commitments: [], occurrences: [], invoices: [], items: [] }), '2027-03');
    expect(futureEmpty.phase).toBe('future');
    expect(futureEmpty.completeness).toBe('partial');
    expect(futureEmpty.sustainability.knownResultCents).toBe(0);
  });
});

describe('mês inteiro × caixa restante', () => {
  it('outubro: contas já pagas fazem parte do resultado do mês, mesmo faltando só uma pendência', () => {
    const oct = buildMonthView(source(), '2026-10');
    const s = oct.sustainability;
    expect(s.incomeCents).toBe(610000); // salário já recebido + pagamento previsto
    expect(s.directCents).toBe(370000); // aluguel e condomínio pagos + psicólogo pendente
    expect(s.directLines.filter((l) => l.done).reduce((t, l) => t + l.amountCents, 0)).toBe(340000);
    expect(s.invoicesCents).toBe(350000); // fatura Lucas fechada + fatura Matheus paga
    expect(s.knownResultCents).toBe(610000 - 370000 - 350000);
  });

  it('caixa restante: saldo de hoje + pendências, sem mover de novo o que já foi pago/recebido', () => {
    const oct = buildMonthView(source(), '2026-10');
    expect(oct.cash).toMatchObject({
      kind: 'current',
      openingCents: 500000,
      pendingInflowCents: 150000, // só o pagamento ainda não recebido (o salário já está no saldo)
      // psicólogo pendente (30.000) + condomínio de setembro ainda sem baixa (70.000) + fatura fechada do Lucas (100.000);
      // aluguel/condomínio de outubro pagos e fatura paga do Matheus NÃO entram
      pendingOutflowCents: 200000,
      expectedCents: 500000 + 150000 - 200000,
    });
  });

  it('pendência de mês anterior aparece na lista, mas fica fora do resultado do mês escolhido', () => {
    const oct = buildMonthView(source(), '2026-10');
    const carried = oct.commitmentsDirect.find((e) => e.carriedOver);
    expect(carried).toMatchObject({ label: 'Condomínio', month: '2026-09', state: 'pending', overdue: true });
    expect(oct.sustainability.directCents).toBe(370000); // não soma o condomínio de setembro
    const sep = buildMonthView(source(), '2026-09');
    expect(sep.commitmentsDirect.find((e) => e.label === 'Condomínio')).toMatchObject({ state: 'pending', carriedOver: false });
  });

  it('mês histórico: mostra só os registros, sem hipóteses e sem reconstruir saldo bancário de época', () => {
    const sep = buildMonthView(source(), '2026-09');
    expect(sep.cash).toBeNull();
    expect(sep.cashTimeline).toEqual([]);
    expect(sep.sustainability.hypothesisAllowed).toBe(false);
    expect(sep.sustainability.averageResultCents).toBeNull();
    expect(sep.sustainability.estimatedGapCents).toBe(0);
    expect(sep.installmentsInferred).toEqual([]);
    expect(sep.completeness).toBe('closed'); // as duas faturas de setembro estão pagas/fechadas
    expect(sep.sustainability.invoicesCents).toBe(400000 + 374031);
    expect(sep.goal.hypothesisCents).toBeNull();
  });

  it('mês anterior com fatura aberta ou ausente é marcado como incompleto', () => {
    const aug = buildMonthView(source({ invoices: source().invoices.filter((i) => !(i.card === 'nubank_2' && i.month === '2026-08')) }), '2026-08');
    expect(aug.completeness).toBe('incomplete');
    expect(aug.goal.basis).toBe('partial');
  });

  it('mês futuro: sustentabilidade isolada; o caixa acumulado é outra coisa e carrega só o registrado', () => {
    const base = buildMonthView(source(), '2026-11');
    expect(base.phase).toBe('future');
    expect(base.completeness).toBe('partial');
    expect(base.cash).toMatchObject({ kind: 'future', openingCents: 450000 }); // fecha outubro com 4.500,00 esperados
    expect(base.cash?.expectedCents).toBe(450000 + 610000 - (370000 + 150000));

    // Uma conta extra em OUTUBRO muda o caixa de novembro, mas não a sustentabilidade de novembro.
    const extra = commitment('x', 'Dentista', 100000, 20, '2026-10', { recurrence: 'none', dueDate: '2026-10-20' });
    const changed = buildMonthView(source({ commitments: [...source().commitments, extra] }), '2026-11');
    expect(changed.cash?.openingCents).toBe(base.cash!.openingCents - 100000);
    expect(changed.sustainability.knownResultCents).toBe(base.sustainability.knownResultCents);
    expect(changed.sustainability.averageResultCents).toBe(base.sustainability.averageResultCents);
  });

  it('novembro: mantendo a média, completa só a diferença da fatura aberta e usa a média cheia do cartão sem fatura', () => {
    const nov = buildMonthView(source(), '2026-11').sustainability;
    expect(nov.knownResultCents).toBe(610000 - 370000 - 150000);
    expect(nov.cards.map((c) => [c.kind, c.gapCents])).toEqual([['partial', 400000 - 150000], ['average', 374031]]);
    expect(nov.averageResultCents).toBe(90000 - 250000 - 374031);
  });

  it('a reserva nunca entra: mudar a reserva não altera nenhum número do mês', () => {
    const a = buildMonthView(source(), '2026-11');
    const b = buildMonthView(source({ balance: { availableCents: 500000, reserveCents: 99999999, availableUpdatedAt: 'x', reserveUpdatedAt: 'y' } }), '2026-11');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('todos os valores calculados são centavos inteiros e finitos', () => {
    const v = buildMonthView(source({ goals: [{ id: 'g', scope: 'default', month: '2026-10', amountCents: 777777, updatedAt: null }] }), '2026-11');
    const numbers = [
      v.committedCents, v.sustainability.knownResultCents, v.sustainability.averageResultCents ?? 0, v.sustainability.limit.combinedCents,
      v.goal.spentCents, v.goal.remainingCents ?? 0, v.goal.overCents, v.cash?.expectedCents ?? 0, ...v.cashTimeline.map((m) => m.resultCents),
    ];
    for (const n of numbers) expect(Number.isInteger(n)).toBe(true);
  });
});

describe('situação das faturas no mês', () => {
  it('aberta = parcial, fechada/paga = completa, ausente = nenhuma', () => {
    const nov = buildMonthView(source(), '2026-11');
    expect(nov.cards.map((c) => c.completeness)).toEqual(['partial', 'none']);
    expect(nov.goal.basis).toBe('partial');
    const oct = buildMonthView(source(), '2026-10');
    expect(oct.cards.map((c) => c.completeness)).toEqual(['complete', 'complete']);
    expect(oct.goal.basis).toBe('complete');
    expect(buildMonthView(source(), '2026-12').goal.basis).toBe('none');
  });

  it('fatura antiga marcada como não paga é sinalizada na visão (sem alterar nada)', () => {
    const v = buildMonthView(source({ invoices: [...source().invoices, L('2026-06', 626512, 'open')] }), '2026-10');
    expect(v.staleInvoices.map((i) => i.month)).toEqual(['2026-06']);
  });
});

describe('parcelas', () => {
  it('lançadas na fatura do mês × inferidas (ainda não lançadas) — sem somar duas vezes', () => {
    const nov = buildMonthView(source(), '2026-11');
    // Notebook 3/6 já está na fatura de novembro; Cadeira 6/6 ainda não: é inferida.
    expect(nov.installmentsLaunched.map((i) => `${i.description} ${i.installmentNo}/${i.installmentTotal}`)).toEqual(['Notebook 3/6']);
    expect(nov.installmentsInferred.map((i) => `${i.description} ${i.installmentNo}/${i.installmentTotal}`)).toEqual(['Cadeira 6/6']);
    // A parcela inferida NÃO entra em nenhum total: o comprometido é só fatura + diretos + fixos no cartão.
    expect(nov.committedCents).toBe(370000 + 150000);
    expect(nov.sustainability.invoicesCents).toBe(150000); // a parcela lançada já está dentro da fatura
  });

  it('dezembro: parcelas seguintes são só inferidas e continuam informativas', () => {
    const dec = buildMonthView(source(), '2026-12');
    expect(dec.installmentsLaunched).toEqual([]);
    expect(dec.installmentsInferred.map((i) => `${i.description} ${i.installmentNo}/${i.installmentTotal}`)).toEqual(['Notebook 4/6']);
    expect(dec.committedCents).toBe(370000);
  });

  it('a média estatística é uma hipótese separada das parcelas inferidas', () => {
    const dec = buildMonthView(source(), '2026-12');
    const gap = dec.sustainability.estimatedGapCents;
    expect(gap).toBe(400000 + 374031); // sem fatura: média cheia dos dois cartões
    const withoutInstallments = buildMonthView(source({ items: [] }), '2026-12');
    expect(withoutInstallments.sustainability.estimatedGapCents).toBe(gap); // as parcelas inferidas não mexem na hipótese
  });

  it('mês encerrado não infere parcelas', () => {
    expect(buildMonthView(source(), '2026-09').installmentsInferred).toEqual([]);
  });

  it('indica quanto do mês já está comprometido em relação às entradas cadastradas', () => {
    const nov = buildMonthView(source(), '2026-11');
    expect(nov.committedPercentOfIncome).toBe(Math.round(((370000 + 150000) / 610000) * 100));
    expect(buildMonthView(source({ fixedIncomes: [] }), '2026-11').committedPercentOfIncome).toBeNull();
  });
});

describe('meta mensal conjunta — resolução por mês', () => {
  const goals: CardGoal[] = [
    { id: '1', scope: 'default', month: '2026-08', amountCents: 500000, updatedAt: null },
    { id: '2', scope: 'month', month: '2026-12', amountCents: 800000, updatedAt: null },
    { id: '3', scope: 'default', month: '2027-01', amountCents: 450000, updatedAt: null },
  ];

  it('nenhum valor inventado: sem meta definida o resultado é nulo', () => {
    expect(resolveCardGoal([], '2026-10')).toBeNull();
    expect(resolveCardGoal(goals, '2026-07')).toBeNull(); // antes da primeira meta padrão
  });

  it('meta padrão vale daqui em diante; exceção do mês prevalece; nova padrão substitui a anterior', () => {
    expect(resolveCardGoal(goals, '2026-08')).toEqual({ amountCents: 500000, source: 'default', since: '2026-08' });
    expect(resolveCardGoal(goals, '2026-11')).toMatchObject({ amountCents: 500000, source: 'default' });
    expect(resolveCardGoal(goals, '2026-12')).toEqual({ amountCents: 800000, source: 'month', since: null });
    expect(resolveCardGoal(goals, '2027-01')).toEqual({ amountCents: 450000, source: 'default', since: '2027-01' });
    expect(resolveCardGoal(goals, '2027-02')).toMatchObject({ amountCents: 450000 });
  });

  it('exceção de um mês não afeta os vizinhos', () => {
    expect(resolveCardGoal(goals, '2026-11')?.amountCents).toBe(500000);
    expect(resolveCardGoal(goals, '2027-01')?.amountCents).toBe(450000);
  });
});

describe('progresso: gasto real × meta', () => {
  const goals: CardGoal[] = [{ id: '1', scope: 'default', month: '2026-10', amountCents: 400000, updatedAt: null }];

  it('mede só o que está lançado nas faturas (nunca a estimativa) e calcula restante e percentual', () => {
    const oct = buildMonthView(source({ goals }), '2026-10');
    expect(oct.goal.spentCents).toBe(350000); // 1.000 + 2.500 lançados
    expect(oct.goal.usagePercent).toBe(88);
    expect(oct.goal.remainingCents).toBe(50000);
    expect(oct.goal.overCents).toBe(0);
    expect(oct.goal.basis).toBe('complete');
  });

  it('meta estourada mostra o excedente; fatura aberta é marcada como parcial; hipótese fica à parte', () => {
    const nov = buildMonthView(source({ goals: [{ id: '1', scope: 'default', month: '2026-10', amountCents: 100000, updatedAt: null }] }), '2026-11');
    expect(nov.goal.spentCents).toBe(150000);
    expect(nov.goal.overCents).toBe(50000);
    expect(nov.goal.remainingCents).toBe(0);
    expect(nov.goal.usagePercent).toBe(150);
    expect(nov.goal.basis).toBe('partial');
    // a hipótese (média) nunca se mistura com o gasto lançado
    expect(nov.goal.hypothesisCents).toBe(150000 + 250000 + 374031);
    expect(nov.goal.spentCents).toBe(150000);
  });

  it('aviso discreto quando a meta do casal passa do limite sustentável (nunca bloqueia)', () => {
    const above = buildMonthView(source({ goals: [{ id: '1', scope: 'default', month: '2026-10', amountCents: 900000, updatedAt: null }] }), '2026-11');
    expect(above.sustainability.limit.combinedCents).toBe(240000);
    expect(above.goal.aboveSustainableLimit).toBe(true);
    expect(above.goal.resolved?.amountCents).toBe(900000); // a escolha do casal permanece
    const within = buildMonthView(source({ goals: [{ id: '1', scope: 'default', month: '2026-10', amountCents: 200000, updatedAt: null }] }), '2026-11');
    expect(within.goal.aboveSustainableLimit).toBe(false);
    // sem entradas cadastradas não há limite confiável: nenhum aviso
    const noIncome = buildMonthView(source({ fixedIncomes: [], goals }), '2026-11');
    expect(noIncome.goal.aboveSustainableLimit).toBe(false);
  });

  it('mês encerrado não compara com limite hipotético', () => {
    const sep = buildMonthView(source({ goals: [{ id: '1', scope: 'default', month: '2026-07', amountCents: 999999999, updatedAt: null }] }), '2026-09');
    expect(sep.goal.aboveSustainableLimit).toBe(false);
  });
});

describe('integridade e compartilhamento', () => {
  it('a visão é função pura dos dados do workspace: os mesmos dados dão exatamente o mesmo resultado (Lucas e Matheus)', () => {
    const goals: CardGoal[] = [{ id: '1', scope: 'default', month: '2026-10', amountCents: 400000, updatedAt: null }];
    const lucas = buildMonthView(source({ goals }), '2026-11');
    const matheus = buildMonthView(structuredClone(source({ goals })), '2026-11');
    expect(JSON.stringify(lucas)).toBe(JSON.stringify(matheus));
  });

  it('não altera os dados de entrada (nada é gravado, corrigido ou reclassificado)', () => {
    const src = source();
    const before = JSON.stringify(src);
    buildMonthView(src, '2026-09');
    buildMonthView(src, '2026-10');
    buildMonthView(src, '2026-12');
    expect(JSON.stringify(src)).toBe(before);
  });

  it('compromisso no cartão já conciliado com a fatura não é somado de novo no mês', () => {
    const streaming = commitment('s', 'Streaming', 5000, 9, '2026-11', { billing: 'card', card: 'nubank_1' });
    const linkedItem = { ...item(novLucas, 'Streaming', null, null, 5000), commitmentId: 's' };
    const v = buildMonthView(source({ commitments: [...source().commitments, streaming], items: [...source().items, linkedItem] }), '2026-11');
    expect(v.commitmentsCard[0]).toMatchObject({ cardState: 'reconciled', countedCents: 0 });
    expect(v.sustainability.cardFixedCents).toBe(0);
    // Sem vínculo, aguarda a fatura e soma como previsto, uma vez só.
    const awaiting = buildMonthView(source({ commitments: [...source().commitments, streaming] }), '2026-11');
    expect(awaiting.commitmentsCard[0]).toMatchObject({ cardState: 'awaiting_invoice', countedCents: 5000 });
    expect(awaiting.sustainability.cardFixedCents).toBe(5000);
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import FinancasPage from '@/app/financas/page';
import ComparativoPage from '@/app/financas/comparativo/page';
import { CardGoalCard } from '@/components/finance-cash/goal-card';
import { MonthSummaryCard, SustainabilityCard } from '@/components/finance-cash/month-summary';
import { MonthNavigator } from '@/components/finance-cash/month-parts';
import { buildMonthView } from '@/modules/finance/cash/domain/month-view';
import type { CardGoal } from '@/modules/finance/cash/domain/card-goals';
import { source } from './helpers-finance-month';

const cmds = {
  setCardGoal: vi.fn(async () => undefined),
  clearCardGoal: vi.fn(async () => undefined),
  changeInvoiceStatus: vi.fn(async () => undefined),
  markCommitmentPaid: vi.fn(async () => undefined),
};
const getSnapshot = vi.fn();
const fakeRepo = { subscribe: () => () => {} };

vi.mock('@/lib/dates', async (orig) => ({ ...(await orig<typeof import('@/lib/dates')>()), todayDateStr: () => '2026-10-16' }));
vi.mock('@/providers/repository.provider', () => ({
  useRepositories: () => ({
    itemRepository: fakeRepo, projectRepository: fakeRepo, dailyPlanRepository: fakeRepo, calendarEventLinkRepository: fakeRepo,
    learningContentRepository: fakeRepo, studySessionRepository: fakeRepo, lessonProgressRepository: fakeRepo, shoppingListRepository: fakeRepo,
    financeRepository: fakeRepo, financeCashRepository: fakeRepo, practiceRepository: fakeRepo, workoutRepository: fakeRepo,
    changeNotifier: { subscribe: () => () => {} },
  }),
  useQueries: () => ({ financeCash: { getSnapshot } }),
  useCommands: () => ({ financeCash: cmds }),
}));
vi.mock('@/components/finance-cash/register-movement', () => ({ RegisterMovementButton: () => <button type="button">Registrar movimentação</button> }));

const GOALS: CardGoal[] = [
  { id: 'g1', scope: 'default', month: '2026-10', amountCents: 400000, updatedAt: null },
  { id: 'g2', scope: 'month', month: '2026-11', amountCents: 800000, updatedAt: null },
];

function snapshot(over: Record<string, unknown> = {}) {
  return {
    ...source({ goals: GOALS }), categories: [], categoriesPersisted: true, expenses: [], categoryRules: [], goalsAvailable: true, ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSnapshot.mockResolvedValue(snapshot());
  window.localStorage.clear();
});
afterEach(cleanup);

const label = () => screen.getByTestId('selected-month').textContent;
const next = () => fireEvent.click(screen.getByLabelText('Próximo mês'));
const prev = () => fireEvent.click(screen.getByLabelText('Mês anterior'));
const section = (name: string) => screen.getByLabelText(name);

describe('navegação por mês na página de Finanças', () => {
  it('abre no mês atual (data local), em destaque, sem botão de retorno', async () => {
    render(<FinancasPage />);
    await waitFor(() => expect(section('Resumo do mês')).toBeTruthy());
    expect(label()).toBe('Outubro de 2026');
    expect(screen.getByText('Mês atual')).toBeTruthy();
    expect(screen.queryByText('Voltar ao mês atual')).toBeNull();
    expect(within(section('Resumo do mês')).getByText('Mês em andamento')).toBeTruthy();
  });

  it('as setas trocam o mês e TODAS as seções acompanham — mesma estrutura, dados do período', async () => {
    render(<FinancasPage />);
    await waitFor(() => expect(section('Resumo do mês')).toBeTruthy());

    // Outubro: aluguel e condomínio pagos; psicólogo pendente; meta padrão; faturas fechada/paga.
    const comm = section('Compromissos do mês');
    expect(within(comm).getAllByText('Pago').length).toBe(2);
    expect(within(comm).getByLabelText('Marcar Psicólogo como pago')).toBeTruthy();
    expect(within(section('Meta mensal dos cartões')).getByText('Meta padrão desde outubro de 2026')).toBeTruthy();

    next();
    expect(label()).toBe('Novembro de 2026');
    expect(within(section('Resumo do mês')).getByText('Mês futuro · só o que já está cadastrado')).toBeTruthy();
    // Novembro: nada pago ainda; a meta de novembro é uma exceção; fatura do Lucas aberta; Matheus sem fatura.
    expect(within(section('Compromissos do mês')).queryAllByText('Pago')).toHaveLength(0);
    expect(within(section('Compromissos do mês')).getByLabelText('Marcar Aluguel como pago')).toBeTruthy();
    expect(within(section('Meta mensal dos cartões')).getByText('Exceção só para este mês')).toBeTruthy();
    expect(within(section('Faturas dos cartões')).getAllByText('Aberta').length).toBeGreaterThan(0);
    expect(within(section('Faturas dos cartões')).getByText('Nenhuma fatura cadastrada para este mês.')).toBeTruthy();
    expect(within(section('Sustentabilidade do mês')).getAllByText(/Novembro de 2026/).length).toBeGreaterThan(0);
    expect(within(section('Entradas do mês')).queryAllByText('Recebida')).toHaveLength(0);

    next();
    expect(label()).toBe('Dezembro de 2026');
    expect(within(section('Meta mensal dos cartões')).getByText('Meta padrão desde outubro de 2026')).toBeTruthy(); // volta à padrão
    expect(within(section('Faturas dos cartões')).getAllByText('Nenhuma fatura cadastrada para este mês.')).toHaveLength(2);
  });

  it('mês anterior: histórico de pagamentos, sem caixa de época e sem hipóteses', async () => {
    render(<FinancasPage />);
    await waitFor(() => expect(section('Resumo do mês')).toBeTruthy());
    prev();
    expect(label()).toBe('Setembro de 2026');
    const summary = section('Resumo do mês');
    expect(within(summary).getByText('Mês encerrado · faturas fechadas ou pagas')).toBeTruthy();
    expect(within(summary).getByText(/Não reconstruímos o saldo bancário daquela época/)).toBeTruthy();
    expect(within(summary).queryByText('Hipótese')).toBeNull();
    expect(within(section('Sustentabilidade do mês')).queryByRole('tab')).toBeNull();
    expect(within(section('Meta mensal dos cartões')).getByText(/Ainda não há meta para Setembro de 2026/)).toBeTruthy();
    // pendência antiga fica visível no mês de origem
    expect(within(section('Compromissos do mês')).getByLabelText('Marcar Condomínio como pago')).toBeTruthy();
  });

  it('"Voltar ao mês atual" aparece fora do mês atual e restaura tudo', async () => {
    render(<FinancasPage />);
    await waitFor(() => expect(section('Resumo do mês')).toBeTruthy());
    next(); next(); next();
    expect(label()).toBe('Janeiro de 2027');
    fireEvent.click(screen.getByText('Voltar ao mês atual'));
    expect(label()).toBe('Outubro de 2026');
    expect(screen.queryByText('Voltar ao mês atual')).toBeNull();
  });

  it('meses distantes e vazios usam exatamente os mesmos componentes', async () => {
    getSnapshot.mockResolvedValue(snapshot({ fixedIncomes: [], commitments: [], occurrences: [], invoices: [], items: [], goals: [] }));
    render(<FinancasPage />);
    await waitFor(() => expect(section('Resumo do mês')).toBeTruthy());
    for (let i = 0; i < 8; i += 1) next();
    expect(label()).toBe('Junho de 2027');
    for (const name of ['Resumo do mês', 'Meta mensal dos cartões', 'Compromissos do mês', 'Entradas do mês', 'Faturas dos cartões', 'Sustentabilidade do mês']) {
      expect(section(name), name).toBeTruthy();
    }
    expect(screen.getByText('Definir nossa meta mensal')).toBeTruthy();
    expect(within(section('Compromissos do mês')).getByText('Nenhum compromisso neste mês.')).toBeTruthy();
  });

  it('mantém a ordem pedida: resumo, registrar, meta, compromissos, entradas, faturas, sustentabilidade', async () => {
    render(<FinancasPage />);
    await waitFor(() => expect(section('Resumo do mês')).toBeTruthy());
    const names = ['Resumo do mês', 'Registrar movimentação', 'Meta mensal dos cartões', 'Compromissos do mês', 'Entradas do mês', 'Faturas dos cartões', 'Sustentabilidade do mês', 'Análises de gastos'];
    const els = names.map((n) => section(n));
    for (let i = 1; i < els.length; i += 1) {
      expect(els[i - 1].compareDocumentPosition(els[i]) & Node.DOCUMENT_POSITION_FOLLOWING, names[i]).toBeTruthy();
    }
    expect(screen.getByText('Comparar meses').closest('a')?.getAttribute('href')).toBe('/financas/comparativo');
  });
});

describe('navegador de mês: acessibilidade e toque', () => {
  it('setas rotuladas, área de toque ≥ 44px, mês anunciado (aria-live) e limites desabilitam a seta', () => {
    const onChange = vi.fn();
    const { rerender } = render(<MonthNavigator month="2026-10" currentMonth="2026-10" onChange={onChange} />);
    const prevBtn = screen.getByLabelText('Mês anterior');
    expect(prevBtn.className).toMatch(/h-12 w-12/);
    expect(screen.getByTestId('selected-month').getAttribute('aria-live')).toBe('polite');
    fireEvent.click(prevBtn);
    expect(onChange).toHaveBeenCalledWith('2026-09');
    fireEvent.click(screen.getByLabelText('Próximo mês'));
    expect(onChange).toHaveBeenCalledWith('2026-11');
    rerender(<MonthNavigator month="2029-10" currentMonth="2026-10" onChange={onChange} />);
    expect((screen.getByLabelText('Próximo mês') as HTMLButtonElement).disabled).toBe(true);
    rerender(<MonthNavigator month="2021-10" currentMonth="2026-10" onChange={onChange} />);
    expect((screen.getByLabelText('Mês anterior') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('resumo: mês inteiro × caixa restante', () => {
  const view = (month: string) => buildMonthView(source(), month);
  const balance = source().balance;

  it('outubro mostra entradas, compromissos e faturas com o que já foi pago/recebido e o que falta', () => {
    render(<MonthSummaryCard view={view('2026-10')} balance={balance} />);
    expect(screen.getByText('Resultado do mês inteiro')).toBeTruthy();
    const bars = screen.getAllByRole('progressbar');
    expect(bars.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Entradas do mês: recebido 75%', // 4.600 de 6.100
      'Compromissos: pago 92%', // 3.400 de 3.700
      'Faturas dos cartões: paga 71%', // 2.500 de 3.500
    ]);
    expect(screen.getByText(/contando também o que já foi pago ou recebido neste mês/)).toBeTruthy();
  });

  it('caixa restante usa o saldo de hoje + pendências e diz que a reserva nunca entra', () => {
    render(<MonthSummaryCard view={view('2026-10')} balance={balance} />);
    const cash = screen.getByLabelText('Caixa restante');
    expect(within(cash).getByText('Saldo disponível informado hoje')).toBeTruthy();
    expect(within(cash).getByText(/Entradas ainda pendentes de recebimento/)).toBeTruthy();
    expect(within(cash).getByText(/Compromissos e faturas ainda não pagos/)).toBeTruthy();
    expect(within(cash).getByText('Saldo esperado depois dessas movimentações')).toBeTruthy();
    expect(within(cash).getByText(/A reserva protegida nunca entra/)).toBeTruthy();
    expect(within(cash).getByText(/o que já passou não é movimentado de novo/)).toBeTruthy();
  });

  it('a hipótese da média aparece identificada, separada do resultado conhecido', () => {
    render(<MonthSummaryCard view={view('2026-11')} balance={balance} />);
    expect(screen.getByText('Hipótese')).toBeTruthy();
    expect(screen.getByText(/estimativa, não é dívida existente/)).toBeTruthy();
    expect(screen.getByText(/Um mês futuro nunca está completamente conhecido/)).toBeTruthy();
  });
});

describe('sustentabilidade: três leituras e sem divisão por pessoa', () => {
  it('Meta sem a reserva mostra o limite combinado — e NENHUMA divisão entre Lucas e Matheus', () => {
    render(<SustainabilityCard view={buildMonthView(source(), '2026-11')} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Meta sem a reserva' }));
    expect(screen.getByText('Para equilibrar o mês sem usar a reserva, o limite combinado dos cartões seria')).toBeTruthy();
    expect(screen.getAllByText(/R\$\s*2\.400,00/).length).toBeGreaterThan(0);
    expect(screen.getByText(/não é dividido entre Lucas e Matheus/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Sugestão por cartão|proporcional/i);
  });

  it('as três abas existem do mês atual em diante; em mês encerrado só os registros', () => {
    const { unmount } = render(<SustainabilityCard view={buildMonthView(source(), '2026-10')} />);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Conhecido', 'Mantendo a média', 'Meta sem a reserva']);
    unmount();
    render(<SustainabilityCard view={buildMonthView(source(), '2026-08')} />);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByText(/só o que os registros mostram/)).toBeTruthy();
  });

  it('o caixa acumulado fica numa área separada e identificada', () => {
    render(<SustainabilityCard view={buildMonthView(source(), '2026-11')} />);
    expect(screen.getByText('Caixa real acumulado (só o que já está registrado)')).toBeTruthy();
    expect(screen.getByText(/Não inclui médias nem estimativas/)).toBeTruthy();
  });
});

describe('card da meta conjunta', () => {
  const card = (month: string, goals: CardGoal[], goalsAvailable = true) =>
    render(<CardGoalCard view={buildMonthView(source({ goals }), month)} goals={goals} goalsAvailable={goalsAvailable} />);

  it('sem meta: "Definir nossa meta mensal" e nenhum valor inicial inventado', () => {
    card('2026-10', []);
    expect(screen.getByText('Definir nossa meta mensal')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('com meta: barra de progresso legível, percentual, restante e fatura completa', () => {
    card('2026-10', [{ id: 'g', scope: 'default', month: '2026-10', amountCents: 400000, updatedAt: null }]);
    const bar = screen.getByRole('progressbar', { name: 'Uso da meta dos cartões' });
    expect(bar.getAttribute('aria-valuenow')).toBe('88');
    expect(bar.getAttribute('aria-valuetext')).toBe('88% da meta usada');
    expect(screen.getByText('88%')).toBeTruthy();
    expect(screen.getByText(/Restam/)).toBeTruthy();
    expect(screen.getByText('Faturas fechadas ou pagas')).toBeTruthy();
  });

  it('acima da meta: excedente em texto (não só cor) e barra limitada a 100%', () => {
    card('2026-11', [{ id: 'g', scope: 'default', month: '2026-10', amountCents: 100000, updatedAt: null }]);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
    expect(bar.getAttribute('aria-valuetext')).toBe('150% da meta usada, acima da meta');
    expect(screen.getByText(/acima da meta/)).toBeTruthy();
    expect(screen.getByText(/Excedente/)).toBeTruthy();
  });

  it('fatura aberta é sinalizada como parcial e a hipótese da média fica fora da barra', () => {
    card('2026-11', [{ id: 'g', scope: 'default', month: '2026-10', amountCents: 900000, updatedAt: null }]);
    expect(screen.getByText(/Parcial · há fatura aberta/)).toBeTruthy();
    expect(screen.getByText(/o valor ainda pode subir/)).toBeTruthy();
    expect(screen.getByText(/Hipótese: mantendo a média/)).toBeTruthy();
    expect(screen.getByText(/estimativa, não é gasto lançado/)).toBeTruthy();
    expect(screen.getByText(/Aviso discreto: esta meta está acima do limite sustentável/)).toBeTruthy();
  });

  it('banco sem a tabela de metas: avisa sem quebrar e sem oferecer edição', () => {
    card('2026-10', [], false);
    expect(screen.getByText(/ainda não foi aplicada/)).toBeTruthy();
    expect(screen.queryByText('Definir nossa meta mensal')).toBeNull();
  });

  it('define a meta padrão a partir do mês (valor manual) pelo comando, sem mexer em mais nada', async () => {
    card('2026-10', []);
    fireEvent.click(screen.getByText('Definir nossa meta mensal'));
    fireEvent.change(screen.getByLabelText(/Meta dos cartões/), { target: { value: '5.000,00' } });
    fireEvent.click(screen.getByText('Salvar meta'));
    await waitFor(() => expect(cmds.setCardGoal).toHaveBeenCalledWith({ scope: 'default', month: '2026-10', amountCents: 500000 }));
  });

  it('exceção só deste mês, e remoção da exceção volta à meta padrão', async () => {
    const goals: CardGoal[] = [
      { id: 'g1', scope: 'default', month: '2026-10', amountCents: 400000, updatedAt: null },
      { id: 'g2', scope: 'month', month: '2026-11', amountCents: 800000, updatedAt: null },
    ];
    card('2026-11', goals);
    fireEvent.click(screen.getByText('Editar'));
    fireEvent.click(screen.getByText('Remover exceção deste mês'));
    await waitFor(() => expect(cmds.clearCardGoal).toHaveBeenCalledWith('month', '2026-11'));
    cmds.setCardGoal.mockClear();
    fireEvent.click(screen.getByText('Editar'));
    fireEvent.click(screen.getByLabelText(/Só novembro de 2026/));
    fireEvent.change(screen.getByLabelText(/Meta dos cartões/), { target: { value: '6.000,00' } });
    fireEvent.click(screen.getByText('Salvar meta'));
    await waitFor(() => expect(cmds.setCardGoal).toHaveBeenCalledWith({ scope: 'month', month: '2026-11', amountCents: 600000 }));
  });
});

describe('comparativo entre meses (rota própria)', () => {
  it('mostra o gráfico e a tabela de valores exatos, meses sem meta e a distinção fechado × incompleto', async () => {
    render(<ComparativoPage />);
    await waitFor(() => expect(screen.getByLabelText('Gráfico de metas e gastos')).toBeTruthy());
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Meta mensal versus gasto nos cartões, por mês' })).toBeTruthy();
    expect(screen.getByText('Períodos sem meta')).toBeTruthy();
    // outubro: 3.500 lançados contra a meta de 4.000 (mês em curso → incompleto)
    const row = screen.getByRole('row', { name: /Outubro de 2026/ });
    expect(within(row).getByText('Em curso/futuro')).toBeTruthy();
    expect(within(row).getByText(/sobra/)).toBeTruthy();
    // setembro: fechado e sem meta
    const sep = screen.getByRole('row', { name: /Setembro de 2026/ });
    expect(within(sep).getByText('Fechado')).toBeTruthy();
    expect(within(sep).getByText('sem meta')).toBeTruthy();
  });

  it('cada barra tem descrição completa para leitor de tela e a legenda não depende só de cor', async () => {
    render(<ComparativoPage />);
    await waitFor(() => expect(screen.getByLabelText('Gráfico de metas e gastos')).toBeTruthy());
    const oct = screen.getByLabelText(/^Outubro de 2026: .* lançados nos cartões, meta .*Situação: Em curso\/futuro\./);
    expect(oct).toBeTruthy();
    const legend = screen.getByLabelText('Legenda');
    expect(legend.textContent).toMatch(/Mês fechado/);
    expect(legend.textContent).toMatch(/Incompleto ou em curso/);
    expect(legend.textContent).toMatch(/Meta do mês/);
    expect(legend.textContent).toMatch(/▲ Gasto lançado acima da meta/);
  });

  it('ocultar valores também vale no comparativo', async () => {
    window.localStorage.setItem('nossa-casa:ocultar-valores', '1');
    render(<ComparativoPage />);
    await waitFor(() => expect(screen.getByLabelText('Gráfico de metas e gastos')).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/R\$\s*3\.500,00/);
    expect(document.body.textContent).toMatch(/R\$ ••••/);
  });
});

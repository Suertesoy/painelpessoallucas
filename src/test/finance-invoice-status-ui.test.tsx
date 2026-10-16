// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { InvoiceStatusDialog } from '@/components/finance-cash/invoice-status';
import { CurrentMonthCard, UpcomingMonths } from '@/components/finance-cash/month-summary';
import { CardsSection } from '@/components/finance-cash/cards-section';
import type { CardInvoice } from '@/modules/finance/cash/domain/types';
import { projectCash, type InvoiceInput } from '@/modules/finance/cash/domain/projection';
import { estimateCardSpending } from '@/modules/finance/cash/domain/card-estimate';
import { buildSustainability } from '@/modules/finance/cash/domain/sustainability';
import { todayDateStr } from '@/lib/dates';

const cmds = { changeInvoiceStatus: vi.fn(async () => undefined) };
vi.mock('@/providers/repository.provider', () => ({ useCommands: () => ({ financeCash: cmds }) }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const invoice = (over: Partial<CardInvoice> = {}): CardInvoice => ({
  id: 'inv-1', card: 'nubank_2', month: '2026-07', status: 'open', manualAmountCents: null, importedAmountCents: 626512,
  dueDate: '2026-07-10', paidAt: null, lastImportedAt: null, rev: 1, ...over,
});

describe('situação da fatura (Aberta / Fechada / Paga)', () => {
  it('mostra valor, vencimento e a situação atual de forma explícita', () => {
    render(<InvoiceStatusDialog invoice={invoice()} open onClose={() => undefined} />);
    expect(screen.getByText('Aberta (atual)')).toBeTruthy();
    expect(screen.getByText(/R\$\s*6\.265,12/)).toBeTruthy();
    expect(screen.getByText(/Vence/)).toBeTruthy();
    expect((screen.getByText('Confirmar') as HTMLButtonElement).disabled).toBe(true); // nada mudou
  });

  it('marcar como paga: por padrão só confirma um pagamento histórico (sem mexer no saldo)', async () => {
    const onClose = vi.fn();
    render(<InvoiceStatusDialog invoice={invoice()} open onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/Paga/));
    expect(screen.getByText(/só confirmar um pagamento que já aconteceu/i)).toBeTruthy();
    expect(screen.getByText(/O saldo fica como está/)).toBeTruthy();
    fireEvent.click(screen.getByText('Confirmar'));
    await waitFor(() => expect(cmds.changeInvoiceStatus).toHaveBeenCalledWith('inv-1', 'paid', { paidOn: todayDateStr(), deductFromBalance: false }));
    expect(onClose).toHaveBeenCalled();
  });

  it('descontar do saldo é uma escolha separada e explícita', async () => {
    render(<InvoiceStatusDialog invoice={invoice({ status: 'closed' })} open onClose={() => undefined} />);
    fireEvent.click(screen.getByLabelText(/Paga/));
    fireEvent.click(screen.getByLabelText(/descontar agora do saldo disponível/i));
    fireEvent.click(screen.getByText('Confirmar'));
    await waitFor(() => expect(cmds.changeInvoiceStatus).toHaveBeenCalledWith('inv-1', 'paid', { paidOn: todayDateStr(), deductFromBalance: true }));
  });

  it('corrigir uma fatura paga exige confirmação e explica que nada é apagado nem o saldo alterado', async () => {
    render(<InvoiceStatusDialog invoice={invoice({ status: 'paid', paidAt: '2026-07-12T12:00:00.000Z' })} open onClose={() => undefined} />);
    fireEvent.click(screen.getByLabelText(/Aberta/));
    expect(screen.getByRole('alert').textContent).toMatch(/Nenhum lançamento, valor ou histórico é apagado/);
    expect(screen.getByRole('alert').textContent).toMatch(/saldo disponível não é alterado/);
    const confirm = screen.getByText('Confirmar') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Entendi e quero corrigir/));
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(cmds.changeInvoiceStatus).toHaveBeenCalledWith('inv-1', 'open', { paidOn: '2026-07-12', deductFromBalance: false }));
  });

  it('não aceita data de pagamento no futuro', () => {
    render(<InvoiceStatusDialog invoice={invoice()} open onClose={() => undefined} />);
    fireEvent.click(screen.getByLabelText(/Paga/));
    fireEvent.change(screen.getByLabelText('Data do pagamento'), { target: { value: '2099-01-01' } });
    expect((screen.getByText('Confirmar') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Faturas: aviso de fatura antiga não paga', () => {
  it('avisa e leva ao mês da fatura marcada como aberta', () => {
    render(<CardsSection invoices={[invoice()]} currentMonth="2026-10" missingByInvoice={{}} />);
    expect(screen.getByText('Há uma fatura antiga marcada como não paga. Confira o status.')).toBeTruthy();
    fireEvent.click(screen.getByText(/Matheus · Nubank/, { selector: 'button' }));
    expect(screen.getByLabelText(/Situação da fatura Matheus/)).toBeTruthy();
  });

  it('sem fatura antiga pendente, nada é avisado', () => {
    render(<CardsSection invoices={[invoice({ status: 'paid', paidAt: '2026-07-12T12:00:00.000Z' })]} currentMonth="2026-10" missingByInvoice={{}} />);
    expect(screen.queryByText(/Confira o status/)).toBeNull();
  });
});

const inv = (id: string, card: 'nubank_1' | 'nubank_2', month: string, amountCents: number, status: InvoiceInput['status']): InvoiceInput => ({
  id, card, month, status, amountCents, dueDate: `${month}-10`,
});

function summaryProps(invoices: InvoiceInput[], incomeCents = 610000) {
  const input = {
    today: '2026-10-16', months: 4, availableCents: 500000, receivables: [],
    fixedIncomes: [{ id: 'a', description: 'Salário', amountCents: incomeCents, dayOfMonth: 5, startMonth: '2026-11', endMonth: null, active: true }],
    commitments: [{ id: 'r', description: 'Aluguel', amountCents: 370000, recurrence: 'monthly' as const, dueDate: null, dayOfMonth: 7, startMonth: '2026-10', endMonth: null, billing: 'direct' as const, card: null, active: true }],
    occurrences: [], invoices, linkedCommitmentMonths: new Set<string>(),
  };
  const projection = projectCash(input);
  const estimate = estimateCardSpending(invoices, projection, '2026-10');
  const sustainability = buildSustainability({
    today: input.today, months: 4, receivables: [], fixedIncomes: input.fixedIncomes, incomeOccurrences: [], commitments: input.commitments,
    occurrences: [], invoices, projection, estimate,
  });
  const balance = { availableCents: 500000, reserveCents: 900000, availableUpdatedAt: 'x', reserveUpdatedAt: 'x' };
  return { projection, estimate, sustainability, balance };
}

const HISTORY = [
  inv('l7', 'nubank_1', '2026-07', 400000, 'paid'), inv('l8', 'nubank_1', '2026-08', 400000, 'paid'), inv('l9', 'nubank_1', '2026-09', 400000, 'paid'),
  inv('m7', 'nubank_2', '2026-07', 374031, 'paid'), inv('m8', 'nubank_2', '2026-08', 374031, 'paid'), inv('m9', 'nubank_2', '2026-09', 374031, 'paid'),
];

describe('Resumo do mês: sustentabilidade em três leituras', () => {
  it('abre em "mantendo a média" com o texto calmo e a ressalva de que é estimativa', () => {
    const p = summaryProps(HISTORY);
    // outubro ainda não tem entradas cadastradas; usa novembro como "mês" para ver o texto de déficit
    render(<CurrentMonthCard month={p.projection[1]} sustainability={p.sustainability[1]} balance={p.balance} balanceInformed estimate={p.estimate} />);
    expect(screen.getByText(/Mantendo a média dos cartões, seus gastos previstos ultrapassam as entradas do mês em/)).toBeTruthy();
    expect(screen.getAllByText(/R\$\s*5\.340,31/).length).toBeGreaterThan(0);
    expect(screen.getByText('Este cenário é uma estimativa baseada nos últimos três meses, não uma dívida existente.')).toBeTruthy();
  });

  it('meta sem reserva: mostra o limite combinado dos cartões e a divisão por cartão', () => {
    const p = summaryProps(HISTORY);
    render(<CurrentMonthCard month={p.projection[1]} sustainability={p.sustainability[1]} balance={p.balance} balanceInformed estimate={p.estimate} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Meta sem a reserva' }));
    expect(screen.getByText('Para equilibrar o mês sem usar a reserva, o limite combinado dos cartões seria')).toBeTruthy();
    expect(screen.getAllByText(/R\$\s*2\.400,00/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Sugestão por cartão/)).toBeTruthy();
  });

  it('entradas insuficientes: diz que não há limite e não presume que a reserva cobre', () => {
    const p = summaryProps(HISTORY, 200000);
    render(<CurrentMonthCard month={p.projection[1]} sustainability={p.sustainability[1]} balance={p.balance} balanceInformed estimate={p.estimate} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Meta sem a reserva' }));
    expect(screen.getByText(/não cobrem nem os compromissos diretos/)).toBeTruthy();
    expect(screen.getByText(/O painel não assume que a reserva cobre/)).toBeTruthy();
  });

  it('sem 3 faturas completas a leitura "mantendo a média" explica a limitação e não inventa número', () => {
    const p = summaryProps([inv('l9', 'nubank_1', '2026-09', 400000, 'paid')]);
    render(<CurrentMonthCard month={p.projection[1]} sustainability={p.sustainability[1]} balance={p.balance} balanceInformed estimate={p.estimate} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Mantendo a média' }));
    expect(screen.getAllByText(/Sem média confiável/).length).toBeGreaterThan(0);
  });

  it('distingue entradas do mês, saldo disponível e reserva, e avisa que só conta a renda cadastrada', () => {
    const p = summaryProps(HISTORY);
    render(<CurrentMonthCard month={p.projection[1]} sustainability={p.sustainability[1]} balance={p.balance} balanceInformed estimate={p.estimate} />);
    expect(screen.getByText('Entradas do mês (só as cadastradas)')).toBeTruthy();
    expect(screen.getByText('Saldo disponível hoje')).toBeTruthy();
    expect(screen.getByText('Reserva protegida (nunca entra na conta)')).toBeTruthy();
    expect(screen.getByText(/nenhuma renda é inventada/)).toBeTruthy();
  });

  it('mostra o aviso de fatura antiga no mês atual', () => {
    const p = summaryProps(HISTORY);
    render(<CurrentMonthCard month={p.projection[0]} sustainability={p.sustainability[0]} balance={p.balance} balanceInformed estimate={p.estimate} staleCount={1} />);
    expect(screen.getByText(/Há uma fatura antiga marcada como não paga/)).toBeTruthy();
  });

  it('"Como chegamos a esse valor" lista entradas, compromissos, cartões e médias', () => {
    const p = summaryProps(HISTORY);
    const { container } = render(<CurrentMonthCard month={p.projection[1]} sustainability={p.sustainability[1]} balance={p.balance} balanceInformed estimate={p.estimate} />);
    (container.querySelector('details') as HTMLDetailsElement).open = true;
    expect(screen.getByText('Total de entradas cadastradas')).toBeTruthy();
    expect(screen.getByText('Total de compromissos diretos')).toBeTruthy();
    expect(screen.getAllByText(/Média das últimas 3 faturas \(hipótese\)/).length).toBe(2);
    expect(screen.getByText(/Nada é levado para o mês seguinte/)).toBeTruthy();
  });
});

describe('Próximos meses', () => {
  it('cada mês aparece isolado e o caixa real acumulado fica em área separada', () => {
    const p = summaryProps(HISTORY);
    render(<UpcomingMonths months={p.projection} sustainability={p.sustainability} estimate={p.estimate} />);
    expect(screen.getByText(/a falta de um mês não passa para o seguinte/)).toBeTruthy();
    expect(screen.getByText(/Caixa real acumulado/)).toBeTruthy();
    // novembro, dezembro e janeiro mostram o mesmo resultado (nada acumula)
    const values = screen.getAllByText(/R\$\s*5\.340,31/);
    expect(values.length).toBeGreaterThanOrEqual(3);
  });
});

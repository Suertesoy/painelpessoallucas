// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { InvoiceStatusDialog } from '@/components/finance-cash/invoice-status';
import { buildMonthView } from '@/modules/finance/cash/domain/month-view';
import { CardsSection } from '@/components/finance-cash/cards-section';
import type { CardInvoice } from '@/modules/finance/cash/domain/types';
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

const onSelectMonth = vi.fn();
const emptyView = (month: string, invoices: CardInvoice[]) => buildMonthView({
  today: '2026-10-16', balance: { availableCents: 0, reserveCents: 0, availableUpdatedAt: null, reserveUpdatedAt: null },
  receivables: [], fixedIncomes: [], incomeOccurrences: [], commitments: [], occurrences: [], invoices, items: [], goals: [],
}, month);

describe('Faturas: aviso de fatura antiga não paga', () => {
  it('avisa e leva ao mês da fatura marcada como aberta', () => {
    render(<CardsSection invoices={[invoice()]} view={emptyView('2026-07', [invoice()])} currentMonth="2026-10" missingByInvoice={{}} onSelectMonth={onSelectMonth} />);
    expect(screen.getByText('Há uma fatura antiga marcada como não paga. Confira o status.')).toBeTruthy();
    fireEvent.click(screen.getByText(/Matheus · Nubank/, { selector: 'button' }));
    expect(onSelectMonth).toHaveBeenCalledWith('2026-07');
    expect(screen.getByLabelText(/Situação da fatura Matheus/)).toBeTruthy();
  });

  it('sem fatura antiga pendente, nada é avisado', () => {
    const paid = [invoice({ status: 'paid', paidAt: '2026-07-12T12:00:00.000Z' })];
    render(<CardsSection invoices={paid} view={emptyView('2026-07', paid)} currentMonth="2026-10" missingByInvoice={{}} onSelectMonth={onSelectMonth} />);
    expect(screen.queryByText(/Confira o status/)).toBeNull();
  });
});

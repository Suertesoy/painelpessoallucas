// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { FinanceMonthlyForm } from '@/components/finance/finance-monthly-form';
import type { MonthOverview } from '@/modules/finance/application/finance-analytics.queries';

/**
 * Disponível separado por pessoa (seção 12 do pedido) — itens 18, 19, 20 e
 * 21 da lista de testes obrigatórios: Lucas e Matheus salvos separadamente,
 * total calculado como a soma dos dois, e um total pré-existente ainda não
 * distribuído nunca é zerado/atribuído por suposição.
 */

function makeOverview(overrides: Partial<MonthOverview> = {}): MonthOverview {
  return {
    month: '2026-07-01',
    matheusIncomeCents: 500000,
    lucasIncomeCents: 320000,
    otherIncomeCents: 0,
    totalIncomeCents: 820000,
    expenseCents: 0,
    resultCents: 820000,
    availableCashCents: 0,
    lucasAvailableCashCents: 0,
    matheusAvailableCashCents: 0,
    availableCashUnallocated: false,
    savedCashCents: 900000,
    totalFinancialPositionCents: 900000,
    categoryBreakdown: [],
    comparisonWithPreviousMonth: { currentExpenseCents: 0, previousExpenseCents: null, deltaCents: null, text: '' },
    hasMonthlyRecord: true,
    hasTransactions: false,
    summaryText: '',
    cashPositionText: '',
    ...overrides,
  };
}

afterEach(() => cleanup());

describe('FinanceMonthlyForm — disponível separado por pessoa', () => {
  it('mostra campos editáveis separados para o disponível de Lucas e de Matheus', () => {
    render(<FinanceMonthlyForm overview={makeOverview()} defaultMatheusIncomeCents={0} onSubmit={vi.fn()} onUpdateDefaultMatheusIncome={vi.fn()} />);
    expect(screen.getByLabelText(/Dinheiro disponível de Lucas/i)).toBeTruthy();
    expect(screen.getByLabelText(/Dinheiro disponível de Matheus/i)).toBeTruthy();
  });

  it('salva os dois valores separadamente e o total exibido é a soma dos dois', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<FinanceMonthlyForm overview={makeOverview()} defaultMatheusIncomeCents={0} onSubmit={onSubmit} onUpdateDefaultMatheusIncome={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Dinheiro disponível de Lucas/i), { target: { value: '1200.00' } });
    fireEvent.change(screen.getByLabelText(/Dinheiro disponível de Matheus/i), { target: { value: '800.00' } });

    expect(screen.getByText(/Total disponível calculado/i).parentElement?.textContent).toMatch(/R\$\s*2\.000,00/);

    fireEvent.click(screen.getByRole('button', { name: /Salvar valores do mês/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ lucasAvailableCashCents: 120000, matheusAvailableCashCents: 80000 });
  });

  it('renda não é somada de novo ao disponível — os dois campos são independentes', () => {
    render(<FinanceMonthlyForm overview={makeOverview({ matheusIncomeCents: 999999999 })} defaultMatheusIncomeCents={0} onSubmit={vi.fn()} onUpdateDefaultMatheusIncome={vi.fn()} />);
    const lucasCash = screen.getByLabelText(/Dinheiro disponível de Lucas/i) as HTMLInputElement;
    expect(lucasCash.value).toBe('0.00');
  });

  it('total pré-existente não distribuído: mostra aviso e os campos começam vazios, sem atribuir a nenhuma pessoa', () => {
    render(
      <FinanceMonthlyForm
        overview={makeOverview({ availableCashCents: 500000, lucasAvailableCashCents: 0, matheusAvailableCashCents: 0, availableCashUnallocated: true })}
        defaultMatheusIncomeCents={0}
        onSubmit={vi.fn()}
        onUpdateDefaultMatheusIncome={vi.fn()}
      />
    );
    expect(screen.getByText(/ainda não distribuído/i)).toBeTruthy();
    expect(screen.getAllByText(/R\$\s*5\.000,00/).length).toBeGreaterThan(0);
    const lucasCash = screen.getByLabelText(/Dinheiro disponível de Lucas/i) as HTMLInputElement;
    const matheusCash = screen.getByLabelText(/Dinheiro disponível de Matheus/i) as HTMLInputElement;
    expect(lucasCash.value).toBe('');
    expect(matheusCash.value).toBe('');
  });

  it('total pré-existente não distribuído: salvar sem tocar os campos de disponível NUNCA zera o total existente', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <FinanceMonthlyForm
        overview={makeOverview({ availableCashCents: 500000, lucasAvailableCashCents: 0, matheusAvailableCashCents: 0, availableCashUnallocated: true })}
        defaultMatheusIncomeCents={0}
        onSubmit={onSubmit}
        onUpdateDefaultMatheusIncome={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Salvar valores do mês/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const submitted = onSubmit.mock.calls[0][0];
    expect(submitted.lucasAvailableCashCents).toBeUndefined();
    expect(submitted.matheusAvailableCashCents).toBeUndefined();
  });

  it('total pré-existente não distribuído: editar um dos campos e salvar envia os dois valores explicitamente', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <FinanceMonthlyForm
        overview={makeOverview({ availableCashCents: 500000, lucasAvailableCashCents: 0, matheusAvailableCashCents: 0, availableCashUnallocated: true })}
        defaultMatheusIncomeCents={0}
        onSubmit={onSubmit}
        onUpdateDefaultMatheusIncome={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/Dinheiro disponível de Lucas/i), { target: { value: '5000.00' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar valores do mês/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ lucasAvailableCashCents: 500000, matheusAvailableCashCents: 0 });
  });
});

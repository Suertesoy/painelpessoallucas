// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import FinancasPage from '@/app/financas/page';
import type { MonthOverview } from '@/modules/finance/application/finance-analytics.queries';

/**
 * Estados reais da página /financas: carregando, vazio (sem transações
 * suficientes), erro genérico, offline e migration ainda não aplicada —
 * sem chamadas reais ao Supabase (Commands/Queries mockados, mesmo padrão
 * de compras-page.test.tsx).
 */

const EMPTY_OVERVIEW: MonthOverview = {
  month: '2026-07-01',
  matheusIncomeCents: 0,
  lucasIncomeCents: 0,
  otherIncomeCents: 0,
  totalIncomeCents: 0,
  expenseCents: 0,
  resultCents: 0,
  availableCashCents: 0,
  savedCashCents: 0,
  totalFinancialPositionCents: 0,
  categoryBreakdown: [],
  comparisonWithPreviousMonth: {
    currentExpenseCents: 0,
    previousExpenseCents: null,
    deltaCents: null,
    text: 'Não há dados suficientes do mês anterior para comparação.',
  },
  hasMonthlyRecord: false,
  hasTransactions: false,
  summaryText: 'Neste mês, a renda informada foi R$ 0,00 e os gastos confirmados foram R$ 0,00.',
  cashPositionText: 'Com base nos valores informados, existem R$ 0,00 disponíveis e R$ 0,00 guardados.',
};

const ensureDefaults = vi.fn(async () => ({}));
const getMonthOverview = vi.fn(async () => EMPTY_OVERVIEW);
const getExpenseEvolution = vi.fn(async () => []);
const listCategories = vi.fn(async () => []);
const listSources = vi.fn(async () => []);
const listImports = vi.fn(async () => []);
const listTransactions = vi.fn(async () => []);
const getSettings = vi.fn(async () => null);

const fakeRepo = { subscribe: () => () => {} };

vi.mock('@/providers/repository.provider', () => ({
  useRepositories: () => ({
    itemRepository: fakeRepo,
    projectRepository: fakeRepo,
    dailyPlanRepository: fakeRepo,
    calendarEventLinkRepository: fakeRepo,
    learningContentRepository: fakeRepo,
    studySessionRepository: fakeRepo,
    lessonProgressRepository: fakeRepo,
    shoppingListRepository: fakeRepo,
    financeRepository: fakeRepo,
    changeNotifier: { subscribe: () => () => {} },
  }),
  useQueries: () => ({
    finance: {
      analytics: { getMonthOverview, getExpenseEvolution },
      queries: { listCategories, listSources, listImports, listTransactions, getSettings },
    },
  }),
  useCommands: () => ({
    finance: {
      setup: { ensureDefaults, updateDefaultMatheusIncome: vi.fn() },
      import: {},
      monthly: { upsertMonthlyRecord: vi.fn() },
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  ensureDefaults.mockResolvedValue({});
  getMonthOverview.mockResolvedValue(EMPTY_OVERVIEW);
  getExpenseEvolution.mockResolvedValue([]);
  listCategories.mockResolvedValue([]);
  listSources.mockResolvedValue([]);
  listImports.mockResolvedValue([]);
  listTransactions.mockResolvedValue([]);
  getSettings.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FinancasPage — estados', () => {
  it('carregando: mostra mensagem de carregamento antes dos dados chegarem', async () => {
    let resolveOverview: (v: MonthOverview) => void = () => {};
    getMonthOverview.mockReturnValueOnce(new Promise((resolve) => (resolveOverview = resolve)));
    render(<FinancasPage />);
    expect(screen.getByText(/Carregando suas finanças/i)).toBeTruthy();
    resolveOverview(EMPTY_OVERVIEW);
    await waitFor(() => expect(screen.queryByText(/Carregando suas finanças/i)).toBeNull());
  });

  it('vazio: mês sem transações mostra as limitações honestas de dado insuficiente', async () => {
    render(<FinancasPage />);
    await waitFor(() => expect(screen.getByText(/Nenhum gasto confirmado neste mês/i)).toBeTruthy());
    expect(screen.getByText(/Não há dados suficientes do mês anterior/i)).toBeTruthy();
  });

  it('erro genérico: mostra aviso seguro sem detalhes internos do Supabase', async () => {
    getMonthOverview.mockRejectedValue(new Error('permission denied for table finance_transactions'));
    render(<FinancasPage />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(document.body.textContent ?? '').not.toContain('permission denied');
  });

  it('migration ainda não aplicada: mostra orientação clara e distinta, sem quebrar a página', async () => {
    ensureDefaults.mockRejectedValue(new Error('relation "public.finance_categories" does not exist'));
    getMonthOverview.mockRejectedValue(new Error('relation "public.finance_transactions" does not exist'));
    render(<FinancasPage />);
    await waitFor(() => expect(screen.getByText(/módulo Finanças ainda não está disponível/i)).toBeTruthy());
    expect(document.body.textContent ?? '').not.toContain('does not exist');
  });

  it('offline: aviso distingue falta de conexão de outros erros', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    getMonthOverview.mockRejectedValue(new Error('network request failed'));
    render(<FinancasPage />);
    await waitFor(() => expect(screen.getByText(/Sem conexão com a internet/i)).toBeTruthy());
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });

  it('renderiza o link de importação e o título da página (layout básico)', async () => {
    render(<FinancasPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /Finanças/i })).toBeTruthy());
    expect(screen.getByRole('link', { name: /Importar extrato\/fatura/i }).getAttribute('href')).toBe('/financas/importar');
  });
});

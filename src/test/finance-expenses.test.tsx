// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RegisterExpenseButton } from '@/components/finance-cash/expense-dialog';
import { FinanceCashCommands } from '@/modules/finance/cash/application/finance-cash.commands';
import { DEFAULT_CATEGORIES } from '@/modules/finance/cash/domain/categories';
import { expenseToSpendingRow, suggestExpenseCategory } from '@/modules/finance/cash/domain/expenses';
import { breakdownSpending } from '@/modules/finance/cash/domain/spending-groups';
import { EMPTY_FILTER } from '@/modules/finance/cash/domain/spending';
import { todayDateStr } from '@/lib/dates';
import type { Expense } from '@/modules/finance/cash/domain/types';

const expense = (over: Partial<Expense> = {}): Expense => ({
  id: 'e1', description: 'Corte de cabelo', amountCents: 5000, spentOn: '2026-10-14', paymentMethod: 'pix', category: null,
  deductedFromBalance: true, kind: 'expense', source: 'manual', reconciledAt: null, ...over,
});

/* ----------------------------------------------------------------- domínio */
describe('despesas pontuais: domínio', () => {
  it('entram nas análises do mês da DATA do gasto, sem cartão e sem virar dívida', () => {
    const row = expenseToSpendingRow(expense())!;
    expect(row).toMatchObject({ card: null, invoiceMonth: '2026-10', amountCents: 5000, kind: 'purchase', source: 'expense' });
    const b = breakdownSpending([row], { ...EMPTY_FILTER, month: '2026-10' }, [...DEFAULT_CATEGORIES]);
    expect(b.totalCents).toBe(5000);
    expect(b.categories[0].id).toBe('none'); // sem categoria: explícito, não escondido
  });

  it('transferência interna e pagamento de fatura (preparo para conciliação) nunca contam como gasto', () => {
    expect(expenseToSpendingRow(expense({ kind: 'internal_transfer' }))).toBeNull();
    expect(expenseToSpendingRow(expense({ kind: 'invoice_payment' }))).toBeNull();
  });

  it('sugere categoria só com base no que você já fez (histórico consistente ou regra) e que ainda existe', () => {
    const cats = [...DEFAULT_CATEGORIES, { id: 'cuidados', label: 'Cuidados pessoais' }];
    const history = [expense({ id: 'a', category: 'cuidados' }), expense({ id: 'b', category: 'cuidados', spentOn: '2026-09-10' })];
    expect(suggestExpenseCategory('corte de CABELO', 5000, history, [], cats)).toEqual({ category: 'cuidados', source: 'history' });
    // histórico conflitante: não sugere
    expect(suggestExpenseCategory('Corte de cabelo', 5000, [...history, expense({ id: 'c', category: 'other' })], [], cats)).toBeNull();
    // categoria excluída: não sugere uma categoria que não existe mais
    expect(suggestExpenseCategory('Corte de cabelo', 5000, history, [], [...DEFAULT_CATEGORIES])).toBeNull();
    // regra aprendida vence o histórico
    const rule = { id: 'r', merchantKey: 'corte de cabelo', amountCents: 5000, category: 'leisure' };
    expect(suggestExpenseCategory('Corte de cabelo', 5000, history, [rule], cats)).toEqual({ category: 'leisure', source: 'rule' });
    expect(suggestExpenseCategory('Algo novo', 100, history, [], cats)).toBeNull();
  });
});

/* ---------------------------------------------------------------- comandos */
describe('despesas pontuais: comandos', () => {
  const repo = {
    listCategories: vi.fn(async () => ({ categories: [...DEFAULT_CATEGORIES], persisted: true })),
    recordExpense: vi.fn(async (v: unknown) => ({ id: 'new', ...(v as object) })),
    saveCategoryRule: vi.fn(async () => ({ id: 'rule', merchantKey: 'x', amountCents: null, category: 'other' })),
    applyCategoryRules: vi.fn(async () => 0),
    deleteExpense: vi.fn(async () => undefined),
    setExpenseCategory: vi.fn(async () => undefined),
  };
  const events: { type: string; payload: Record<string, unknown> }[] = [];
  const commands = () => new FinanceCashCommands(repo as never, { save: async (e: never) => { events.push(e); } } as never, 'ws-1');
  const input = { description: 'Corte de cabelo', amountCents: 5000, spentOn: '2026-10-14', paymentMethod: 'pix' as const, category: 'health', deductFromBalance: true };

  beforeEach(() => { vi.clearAllMocks(); events.length = 0; });

  it('registra o gasto sem aprender nada por padrão (opt-in)', async () => {
    await commands().recordExpense(input);
    expect(repo.recordExpense).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 5000, paymentMethod: 'pix', deductFromBalance: true }));
    expect(repo.saveCategoryRule).not.toHaveBeenCalled();
  });

  it('com aprendizado: padrão estabelecimento + valor; qualquer valor só se pedido', async () => {
    await commands().recordExpense(input, 'amount');
    expect(repo.saveCategoryRule).toHaveBeenLastCalledWith({ merchantKey: 'corte de cabelo', amountCents: 5000, category: 'health' });
    await commands().recordExpense(input, 'merchant');
    expect(repo.saveCategoryRule).toHaveBeenLastCalledWith({ merchantKey: 'corte de cabelo', amountCents: null, category: 'health' });
    expect(repo.applyCategoryRules).toHaveBeenCalledTimes(2);
  });

  it('valida valor, data, forma de pagamento e categoria existente', async () => {
    await expect(commands().recordExpense({ ...input, amountCents: 0 })).rejects.toThrow();
    await expect(commands().recordExpense({ ...input, amountCents: -5 })).rejects.toThrow();
    await expect(commands().recordExpense({ ...input, spentOn: '14/10/2026' })).rejects.toThrow();
    await expect(commands().recordExpense({ ...input, paymentMethod: 'cheque' as never })).rejects.toThrow();
    await expect(commands().recordExpense({ ...input, category: 'inexistente' })).rejects.toThrow(/inválida/i);
    expect(repo.recordExpense).not.toHaveBeenCalled();
  });

  it('eventos não carregam valores monetários', async () => {
    await commands().recordExpense(input);
    await commands().deleteExpense('e1', true);
    expect(JSON.stringify(events)).not.toMatch(/5000|amount/);
    expect(repo.deleteExpense).toHaveBeenCalledWith('e1', true);
  });
});

/* --------------------------------------------------------------------- tela */
const cmds = {
  recordExpense: vi.fn(async () => undefined),
  createCategory: vi.fn(async () => 'cuidados_pessoais'),
};
vi.mock('@/providers/repository.provider', () => ({ useCommands: () => ({ financeCash: cmds }) }));

afterEach(cleanup);

describe('registrar gasto (tela)', () => {
  const open = (props: Partial<React.ComponentProps<typeof RegisterExpenseButton>> = {}) => {
    render(<RegisterExpenseButton categories={[...DEFAULT_CATEGORIES]} persistedCategories expenses={[]} rules={[]} {...props} />);
    fireEvent.click(screen.getByText('Registrar gasto'));
  };

  it('fluxo mínimo: descrição, valor, data (hoje), forma de pagamento, categoria e salvar', async () => {
    open();
    expect((screen.getByLabelText('Data') as HTMLInputElement).value).toBe(todayDateStr());
    expect((screen.getByLabelText('Pix') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Descontar do saldo disponível/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByText('Salvar') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Corte de cabelo' } });
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '50,00' } });
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'health' } });
    fireEvent.click(screen.getByText('Salvar'));
    await waitFor(() => expect(cmds.recordExpense).toHaveBeenCalledWith(
      { description: 'Corte de cabelo', amountCents: 5000, spentOn: todayDateStr(), paymentMethod: 'pix', category: 'health', deductFromBalance: true, requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) },
      undefined
    ));
  });

  it('a data pode ser alterada e a forma de pagamento escolhida', async () => {
    open();
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Feira' } });
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '32,50' } });
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-10-10' } });
    fireEvent.click(screen.getByLabelText('Dinheiro'));
    fireEvent.click(screen.getByLabelText(/Descontar do saldo disponível/));
    fireEvent.click(screen.getByText('Salvar'));
    await waitFor(() => expect(cmds.recordExpense).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 3250, spentOn: '2026-10-10', paymentMethod: 'cash', category: null, deductFromBalance: false }),
      undefined
    ));
  });

  it('aplica a sugestão do histórico e o aprendizado só vale se marcado', async () => {
    const history = [expense({ id: 'h', category: 'health' })];
    open({ expenses: history });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Corte de cabelo' } });
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '50' } });
    expect((screen.getByLabelText('Categoria') as HTMLSelectElement).value).toBe('health');
    expect(screen.getByText(/Sugestão pelo seu histórico/)).toBeTruthy();
    const learn = screen.getByLabelText('Usar esta categoria em lançamentos semelhantes') as HTMLInputElement;
    expect(learn.checked).toBe(false);
    fireEvent.click(learn);
    fireEvent.click(screen.getByText('Salvar'));
    await waitFor(() => expect(cmds.recordExpense).toHaveBeenCalledWith(expect.objectContaining({ category: 'health' }), 'amount'));
  });

  it('cria categoria nova no próprio fluxo e a usa', async () => {
    open();
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Corte de cabelo' } });
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: '__new__' } });
    fireEvent.change(screen.getByLabelText('Nome da nova categoria'), { target: { value: 'Cuidados pessoais' } });
    fireEvent.click(screen.getByText('Salvar'));
    await waitFor(() => expect(cmds.createCategory).toHaveBeenCalledWith('Cuidados pessoais'));
    await waitFor(() => expect(cmds.recordExpense).toHaveBeenCalledWith(expect.objectContaining({ category: 'cuidados_pessoais' }), undefined));
  });
});

/* --------------------------------------------------------------- migration */
describe('migration de despesas pontuais', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260819100000_finance_expenses.sql'), 'utf8');

  it('isola por workspace (RLS) e valida valor positivo, forma de pagamento e tipo', () => {
    expect(sql).toMatch(/alter table public\.finance_expenses enable row level security/);
    expect((sql.match(/is_workspace_member\(workspace_id\)/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(sql).toMatch(/amount_cents bigint not null check \(amount_cents > 0\)/);
    expect(sql).toMatch(/payment_method in \('pix', 'debit', 'cash', 'other'\)/);
    expect(sql).not.toMatch(/to anon/);
  });

  it('prepara a conciliação futura sem implementá-la: tipo, origem, referência externa e conciliação', () => {
    expect(sql).toMatch(/kind in \('expense', 'internal_transfer', 'invoice_payment'\)/);
    expect(sql).toMatch(/source in \('manual', 'bank_statement'\)/);
    expect(sql).toMatch(/external_ref text/);
    expect(sql).toMatch(/reconciled_at timestamptz/);
  });

  it('registrar e descontar do saldo acontecem na mesma função (transação) e exigem ser membro', () => {
    expect(sql).toMatch(/create or replace function public\.finance_record_expense/);
    expect((sql.match(/finance_assert_member/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(sql).toMatch(/available_cents = available_cents - p_amount_cents/);
    expect(sql).toMatch(/v_row\.deducted_from_balance/); // só devolve ao saldo o que foi descontado
    expect(sql).toMatch(/revoke execute on function public\.finance_record_expense[^;]* from public, anon/);
  });

  it('é idempotente por solicitação: duplo toque ou nova tentativa não duplicam gasto nem desconto', () => {
    expect(sql).toMatch(/create unique index finance_expenses_request_idx/);
    expect(sql).toMatch(/on conflict \(workspace_id, request_id\) where request_id is not null do nothing/);
    expect(sql).toMatch(/if not found then/);
  });

  it('não cria compromisso nem altera dados existentes', () => {
    const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(code).not.toMatch(/finance_commitments/);
    expect(code).not.toMatch(/\bupdate public\.finance_(card|invoice|receivable)/);
    expect(code).not.toMatch(/drop (table|column)/i);
  });
});

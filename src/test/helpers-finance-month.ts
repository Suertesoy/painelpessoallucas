import type { MonthViewSource } from '@/modules/finance/cash/domain/month-view';
import type { CardId } from '@/modules/finance/cash/domain/month';
import type { CardInvoice, Commitment, FixedIncome, IncomeOccurrence, InvoiceItem, Occurrence } from '@/modules/finance/cash/domain/types';

/** Casa de Lucas e Matheus usada nos testes de Finanças por mês (dados fictícios; hoje = 16/10/2026). */
export const TODAY = '2026-10-16';

export const fixedIncome = (id: string, description: string, amountCents: number, dayOfMonth: number, startMonth: string): FixedIncome => ({
  id, description, amountCents, dayOfMonth, startMonth, endMonth: null, notes: null, active: true,
});
export const commitment = (id: string, description: string, amountCents: number, dayOfMonth: number, startMonth: string, over: Partial<Commitment> = {}): Commitment => ({
  id, description, amountCents, recurrence: 'monthly', dueDate: null, dayOfMonth, startMonth, endMonth: null,
  billing: 'direct', card: null, category: null, active: true, ...over,
});
export const occurrence = (commitmentId: string, month: string, status: Occurrence['status']): Occurrence => ({ id: `${commitmentId}-${month}`, commitmentId, month, amountCents: null, status });
export const incomeOcc = (incomeId: string, month: string, status: IncomeOccurrence['status']): IncomeOccurrence => ({
  id: `${incomeId}-${month}`, incomeId, month, amountCents: null, status, receivedCents: null, receivedAt: null, addedToBalance: false,
});
export const invoice = (card: CardId, month: string, amountCents: number | null, status: CardInvoice['status']): CardInvoice => ({
  id: `inv-${card}-${month}`, card, month, status, manualAmountCents: null, importedAmountCents: amountCents, dueDate: `${month}-10`,
  paidAt: status === 'paid' ? `${month}-12T12:00:00.000Z` : null, lastImportedAt: null, rev: 1,
});
export const item = (inv: CardInvoice, baseDescription: string, installmentNo: number | null, installmentTotal: number | null, amountCents: number): InvoiceItem => ({
  id: `it-${inv.id}-${baseDescription}`, invoiceId: inv.id, date: `${inv.month}-02`, description: baseDescription, normalizedDescription: baseDescription.toLowerCase(),
  amountCents, kind: 'purchase', occurrenceIndex: 0, installmentNo, installmentTotal, baseDescription, status: 'active',
  commitmentId: null, reviewNote: null, category: null, purpose: null,
});

export const L = (m: string, c: number, s: CardInvoice['status'] = 'paid') => invoice('nubank_1', m, c, s);
export const M = (m: string, c: number, s: CardInvoice['status'] = 'paid') => invoice('nubank_2', m, c, s);

export const octLucas = L('2026-10', 100000, 'closed');
export const novLucas = L('2026-11', 150000, 'open');

/** Casa de Lucas e Matheus: entradas R$ 6.100, compromissos R$ 3.700, cartões com histórico de 3 meses pagos. */
export function source(over: Partial<MonthViewSource> = {}): MonthViewSource {
  const invoices = [
    L('2026-07', 400000), L('2026-08', 400000), L('2026-09', 400000), M('2026-07', 374031), M('2026-08', 374031), M('2026-09', 374031),
    octLucas, M('2026-10', 250000), novLucas,
  ];
  return {
    today: TODAY,
    balance: { availableCents: 500000, reserveCents: 900000, availableUpdatedAt: '2026-10-10T10:00:00Z', reserveUpdatedAt: null },
    receivables: [],
    fixedIncomes: [fixedIncome('a', 'Salário Matheus', 460000, 1, '2026-10'), fixedIncome('b', 'Pagamento Gabriel', 150000, 25, '2026-10')],
    incomeOccurrences: [incomeOcc('a', '2026-10', 'received')],
    commitments: [commitment('rent', 'Aluguel', 270000, 7, '2026-09'), commitment('condo', 'Condomínio', 70000, 7, '2026-09'), commitment('psi', 'Psicólogo', 30000, 15, '2026-10')],
    occurrences: [
      occurrence('rent', '2026-09', 'paid'), occurrence('condo', '2026-09', 'pending'), // condomínio de setembro ficou sem baixa
      occurrence('rent', '2026-10', 'paid'), occurrence('condo', '2026-10', 'paid'),
    ],
    invoices,
    items: [
      item(octLucas, 'Notebook', 2, 6, 50000), item(novLucas, 'Notebook', 3, 6, 50000), item(octLucas, 'Cadeira', 5, 6, 55000),
    ],
    goals: [],
    ...over,
  };
}

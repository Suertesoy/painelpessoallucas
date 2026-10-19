import type { SupabaseFinanceCashRepository } from '../infrastructure/supabase-finance-cash.repository';
import {
  projectCash, linkedKey, type MonthProjection, type CommitmentInput, type InvoiceInput, type OccurrenceInput, type ReceivableInput,
} from '../domain/projection';
import { estimateCardSpending, type CardEstimate } from '../domain/card-estimate';
import { buildSustainability, staleUnpaidInvoices, type MonthSustainability } from '../domain/sustainability';
import { projectFutureInstallments, type ProjectedInstallment } from '../domain/installments';
import { addMonths, monthOf } from '../domain/month';
import type { CategoryRule } from '../domain/category-rules';
import { sortCategories, type Category } from '../domain/categories';
import { effectiveInvoiceAmount, type Expense, type Balance, type CardInvoice, type Commitment, type FixedIncome, type IncomeOccurrence, type InvoiceItem, type Occurrence, type Receivable } from '../domain/types';

import type { CardGoal } from '../domain/card-goals';

export const PROJECTION_MONTHS = 4;

export interface FinanceCashSnapshot {
  /** Despesas pontuais já pagas (Pix, débito, dinheiro). */
  expenses: Expense[];
  categories: Category[];
  categoriesPersisted: boolean;
  categoryRules: CategoryRule[];
  today: string;
  balance: Balance;
  receivables: Receivable[];
  commitments: Commitment[];
  occurrences: Occurrence[];
  invoices: CardInvoice[];
  items: InvoiceItem[];
  fixedIncomes: FixedIncome[];
  incomeOccurrences: IncomeOccurrence[];
  projection: MonthProjection[];
  /** Parcelas futuras estimadas — informativas, fora de qualquer total. */
  projectedInstallments: ProjectedInstallment[];
  /** Estimativa opcional de gastos no cartão — separada dos totais confirmados. */
  cardEstimate: CardEstimate;
  /** Sustentabilidade mês a mês (independente; sem déficit carregado de um mês para o outro). */
  sustainability: MonthSustainability[];
  /** Faturas de meses anteriores ainda marcadas como não pagas (aberta/fechada). */
  staleInvoices: InvoiceInput[];
  /** Meta mensal conjunta dos cartões (metas padrão e exceções por mês). */
  goals: CardGoal[];
  /** false = a tabela de metas ainda não existe no banco (a tela mostra o aviso e segue funcionando). */
  goalsAvailable: boolean;
}

export class FinanceCashQueries {
  constructor(private repo: SupabaseFinanceCashRepository) {}

  async getSnapshot(today: string): Promise<FinanceCashSnapshot> {
    const [balance, receivables, commitments, occurrences, invoices, items, fixedIncomes, incomeOccurrences, categoriesResult, categoryRules, expenses, goalsResult] = await Promise.all([
      this.repo.getBalance(), this.repo.listReceivables(), this.repo.listCommitments(),
      this.repo.listOccurrences(), this.repo.listInvoices(), this.repo.listItems(),
      this.repo.listFixedIncomes(), this.repo.listIncomeOccurrences(),
      this.repo.listCategories(), this.repo.listCategoryRules(), this.repo.listExpenses(), this.repo.listCardGoals(),
    ]);

    const invoiceById = new Map(invoices.map((i) => [i.id, i]));
    const linked = new Set<string>();
    for (const item of items) {
      if (!item.commitmentId || item.status === 'removed') continue;
      const inv = invoiceById.get(item.invoiceId);
      if (inv) linked.add(linkedKey(item.commitmentId, inv.card, inv.month));
    }

    const missingByInvoice = new Map<string, number>();
    for (const item of items) {
      if (item.status === 'missing') missingByInvoice.set(item.invoiceId, (missingByInvoice.get(item.invoiceId) ?? 0) + 1);
    }

    const invoiceInputs = invoices.map<InvoiceInput>((i) => ({
      id: i.id, card: i.card, month: i.month, status: i.status, amountCents: effectiveInvoiceAmount(i), dueDate: i.dueDate,
      missingItemsCount: missingByInvoice.get(i.id) ?? 0,
    }));
    const projectionInput = {
      today,
      months: PROJECTION_MONTHS,
      availableCents: balance.availableCents,
      receivables: receivables.map<ReceivableInput>((r) => ({
        id: r.id, description: r.description, amountCents: r.amountCents, expectedDate: r.expectedDate, status: r.status,
      })),
      fixedIncomes: fixedIncomes.map((i) => ({ ...i })),
      incomeOccurrences: incomeOccurrences.map((o) => ({ incomeId: o.incomeId, month: o.month, amountCents: o.amountCents, status: o.status })),
      commitments: commitments.map<CommitmentInput>((c) => ({ ...c })),
      occurrences: occurrences.map<OccurrenceInput>((o) => ({
        commitmentId: o.commitmentId, month: o.month, amountCents: o.amountCents, status: o.status,
      })),
      invoices: invoiceInputs,
      linkedCommitmentMonths: linked,
    };
    // Caixa real: só o que está registrado e pendente (déficits reais seguem visíveis).
    const projection = projectCash(projectionInput);

    const current = monthOf(today);
    const cardEstimate = estimateCardSpending(invoiceInputs, projection, current);
    // Sustentabilidade: cada mês isolado; a média dos cartões é só hipótese.
    const sustainability = buildSustainability({
      today,
      months: PROJECTION_MONTHS,
      receivables: projectionInput.receivables,
      fixedIncomes: projectionInput.fixedIncomes,
      incomeOccurrences: projectionInput.incomeOccurrences,
      commitments: projectionInput.commitments,
      occurrences: projectionInput.occurrences,
      invoices: invoiceInputs,
      projection,
      estimate: cardEstimate,
    });
    const staleInvoices = staleUnpaidInvoices(invoiceInputs, current);
    const projectedInstallments = projectFutureInstallments(
      items.flatMap((it) => {
        const inv = invoiceById.get(it.invoiceId);
        if (!inv || it.kind !== 'purchase') return [];
        return [{
          card: inv.card, invoiceMonth: inv.month, baseDescription: it.baseDescription, installmentNo: it.installmentNo,
          installmentTotal: it.installmentTotal, amountCents: it.amountCents, status: it.status,
        }];
      }),
      current,
      addMonths(current, PROJECTION_MONTHS - 1)
    );

    return { expenses, categories: sortCategories(categoriesResult.categories), categoriesPersisted: categoriesResult.persisted, categoryRules, today, balance, receivables, commitments, occurrences, invoices, items, fixedIncomes, incomeOccurrences, projection, projectedInstallments, cardEstimate, sustainability, staleInvoices, goals: goalsResult.goals, goalsAvailable: goalsResult.available };
  }

  listTransfers() {
    return this.repo.listTransfers();
  }

  listInvoiceItems(invoiceId: string) {
    return this.repo.listItems(invoiceId);
  }

  listInvoiceImports(invoiceId: string) {
    return this.repo.listImports(invoiceId);
  }
}

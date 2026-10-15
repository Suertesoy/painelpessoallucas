import type { SupabaseFinanceCashRepository } from '../infrastructure/supabase-finance-cash.repository';
import {
  projectCash, linkedKey, type MonthProjection, type CommitmentInput, type InvoiceInput, type OccurrenceInput, type ReceivableInput,
} from '../domain/projection';
import { estimateCardSpending, type CardEstimate } from '../domain/card-estimate';
import { projectFutureInstallments, type ProjectedInstallment } from '../domain/installments';
import { addMonths, monthOf } from '../domain/month';
import type { CategoryRule, CustomCategory } from '../domain/category-rules';
import { effectiveInvoiceAmount, type Balance, type CardInvoice, type Commitment, type FixedIncome, type IncomeOccurrence, type InvoiceItem, type Occurrence, type Receivable } from '../domain/types';

export const PROJECTION_MONTHS = 4;

export interface FinanceCashSnapshot {
  customCategories: CustomCategory[];
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
}

export class FinanceCashQueries {
  constructor(private repo: SupabaseFinanceCashRepository) {}

  async getSnapshot(today: string): Promise<FinanceCashSnapshot> {
    const [balance, receivables, commitments, occurrences, invoices, items, fixedIncomes, incomeOccurrences, customCategories, categoryRules] = await Promise.all([
      this.repo.getBalance(), this.repo.listReceivables(), this.repo.listCommitments(),
      this.repo.listOccurrences(), this.repo.listInvoices(), this.repo.listItems(),
      this.repo.listFixedIncomes(), this.repo.listIncomeOccurrences(),
      this.repo.listCustomCategories(), this.repo.listCategoryRules(),
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
    const projection = projectCash({
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
    });

    const current = monthOf(today);
    const cardEstimate = estimateCardSpending(invoiceInputs, projection, current);
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

    return { customCategories, categoryRules, today, balance, receivables, commitments, occurrences, invoices, items, fixedIncomes, incomeOccurrences, projection, projectedInstallments, cardEstimate };
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

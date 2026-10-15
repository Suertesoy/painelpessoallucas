import type { ParsedInvoiceRow } from './nubank-invoice-csv';
import type { ExistingInvoiceItem, ReconcileResult } from './reconcile';

/**
 * Converte o resultado da conciliação + decisões do usuário no plano que a
 * função SQL `finance_apply_invoice_import` aplica atomicamente.
 *
 * Regras:
 *  - Toda divergência EXIGE decisão ('same' | 'different'); sem ela, o plano
 *    não é gerado (nunca se decide por conta própria).
 *  - Ausentes: padrão 'keep' (continuam contando, marcados para revisão);
 *    só somem com 'remove' explícito.
 */

export type DivergenceDecision = 'same' | 'different';
export type MissingDecision = 'keep' | 'remove';

export interface ImportDecisions {
  divergences: Record<string, DivergenceDecision>;
  missing: Record<string, MissingDecision>;
}

/** 'existing:<id>' para item já gravado; 'new:<rowIndex>' para linha nova. */
export type ItemRef = string;

export interface ConfirmedLink {
  ref: ItemRef;
  commitmentId: string;
}

export interface ImportPlan {
  insert: {
    purchase_date: string;
    description: string;
    normalized_description: string;
    amount_cents: number;
    kind: string;
    occurrence_index: number;
    installment_no: number | null;
    installment_total: number | null;
    base_description: string;
    commitment_id: string | null;
  }[];
  recognize: string[];
  update: { id: string; purchase_date: string; amount_cents: number }[];
  missing: string[];
  remove: string[];
  link: { item_id: string; commitment_id: string }[];
  pay_invoice_ids: string[];
  counts: { rows: number; recognized: number; new: number; changed: number; missing: number };
}

export class MissingDecisionError extends Error {
  constructor(public pending: string[]) {
    super(`Há ${pending.length} divergência(s) sem decisão.`);
  }
}

export function pendingDecisions(result: ReconcileResult, decisions: ImportDecisions): string[] {
  return result.divergences.filter((d) => !decisions.divergences[d.key]).map((d) => d.key);
}

const idKey = (date: string, norm: string, amount: number) => `${date}|${norm}|${amount}`;

export function buildImportPlan(
  result: ReconcileResult,
  existingAll: readonly ExistingInvoiceItem[],
  incomingCount: number,
  decisions: ImportDecisions,
  links: readonly ConfirmedLink[],
  payInvoiceIds: readonly string[]
): ImportPlan {
  const pending = pendingDecisions(result, decisions);
  if (pending.length > 0) throw new MissingDecisionError(pending);

  const linkByRef = new Map(links.map((l) => [l.ref, l.commitmentId]));
  const nextFree = new Map<string, number>();
  for (const e of existingAll) {
    const k = idKey(e.date, e.normalizedDescription, e.amountCents);
    nextFree.set(k, Math.max(nextFree.get(k) ?? 0, e.occurrenceIndex + 1));
  }
  const reserve = (row: ParsedInvoiceRow, preferred?: number): number => {
    const k = idKey(row.date, row.normalizedDescription, row.amountCents);
    const free = Math.max(nextFree.get(k) ?? 0, preferred ?? 0);
    nextFree.set(k, free + 1);
    return free;
  };

  const plan: ImportPlan = {
    insert: [],
    recognize: [],
    update: [],
    missing: [],
    remove: [],
    link: [],
    pay_invoice_ids: [...payInvoiceIds],
    counts: { rows: incomingCount, recognized: 0, new: 0, changed: 0, missing: 0 },
  };

  const toInsert = (row: ParsedInvoiceRow, occurrenceIndex: number) => ({
    purchase_date: row.date,
    description: row.description,
    normalized_description: row.normalizedDescription,
    amount_cents: row.amountCents,
    kind: row.kind,
    occurrence_index: occurrenceIndex,
    installment_no: row.installmentNo,
    installment_total: row.installmentTotal,
    base_description: row.baseDescription,
    commitment_id: linkByRef.get(`new:${row.rowIndex}`) ?? null,
  });

  for (const { existing } of result.recognized) {
    plan.recognize.push(existing.id);
    const linked = linkByRef.get(`existing:${existing.id}`);
    if (linked) plan.link.push({ item_id: existing.id, commitment_id: linked });
  }
  plan.counts.recognized = result.recognized.length;

  for (const n of result.newRows) {
    // Os índices de ocorrência já vêm livres da conciliação; reserva garante
    // consistência com os usados por divergências 'different'.
    plan.insert.push(toInsert(n.row, reserve(n.row, n.occurrenceIndex)));
  }

  for (const d of result.divergences) {
    const decision = decisions.divergences[d.key];
    if (decision === 'same') {
      plan.update.push({ id: d.existing.id, purchase_date: d.incoming.date, amount_cents: d.incoming.amountCents });
      plan.counts.changed += 1;
      const linked = linkByRef.get(`existing:${d.existing.id}`);
      if (linked) plan.link.push({ item_id: d.existing.id, commitment_id: linked });
    } else {
      plan.insert.push(toInsert(d.incoming, reserve(d.incoming)));
      plan.missing.push(d.existing.id);
    }
  }

  for (const m of result.missing) {
    if (decisions.missing[m.id] === 'remove') plan.remove.push(m.id);
    else plan.missing.push(m.id);
  }

  plan.counts.new = plan.insert.length;
  plan.counts.missing = plan.missing.length + plan.remove.length;
  return plan;
}

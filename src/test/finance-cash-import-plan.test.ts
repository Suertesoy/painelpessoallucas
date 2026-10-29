// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseNubankInvoiceCsv } from '@/modules/finance/cash/domain/nubank-invoice-csv';
import { reconcileInvoice, type ExistingInvoiceItem } from '@/modules/finance/cash/domain/reconcile';
import { buildImportPlan, MissingDecisionError } from '@/modules/finance/cash/domain/import-plan';

const csv = (...lines: string[]) => ['date,title,amount', ...lines].join('\n');
const parse = (text: string) => parseNubankInvoiceCsv(text).rows;
const asExisting = (rows: ReturnType<typeof parse>): ExistingInvoiceItem[] =>
  rows.map((r, i) => ({
    id: `e${i}`, date: r.date, normalizedDescription: r.normalizedDescription, amountCents: r.amountCents,
    kind: r.kind, occurrenceIndex: r.occurrenceIndex, status: 'active',
  }));
const none = { divergences: {}, missing: {} };

describe('plano de importação', () => {
  it('primeira importação insere tudo, preservando compras idênticas', () => {
    const rows = parse(csv('2026-10-09,Streaming,"150,00"', '2026-10-09,Streaming,"150,00"'));
    const plan = buildImportPlan(reconcileInvoice([], rows), [], rows.length, none, [], []);
    expect(plan.insert.map((i) => i.occurrence_index)).toEqual([0, 1]);
    expect(plan.counts).toMatchObject({ rows: 2, new: 2, recognized: 0 });
  });

  it('reimportar o mesmo arquivo não insere, não remove e não altera nada', () => {
    const rows = parse(csv('2026-10-09,Streaming,"150,00"', '2026-10-10,Padaria,"8,00"'));
    const plan = buildImportPlan(reconcileInvoice(asExisting(rows), rows), asExisting(rows), rows.length, none, [], []);
    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.missing).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.recognize).toHaveLength(2);
  });

  it('divergência sem decisão bloqueia o plano', () => {
    const before = parse(csv('2026-10-01,Mercado,"10,00"'));
    const after = parse(csv('2026-10-01,Mercado,"12,00"'));
    expect(() => buildImportPlan(reconcileInvoice(asExisting(before), after), asExisting(before), 1, none, [], [])).toThrow(
      MissingDecisionError
    );
  });

  it("divergência 'same' atualiza o item existente sem duplicar", () => {
    const before = parse(csv('2026-10-01,Mercado,"10,00"'));
    const after = parse(csv('2026-10-01,Mercado,"12,00"'));
    const result = reconcileInvoice(asExisting(before), after);
    const plan = buildImportPlan(result, asExisting(before), 1, { divergences: { e0: 'same' }, missing: {} }, [], []);
    expect(plan.update).toEqual([{ id: 'e0', purchase_date: '2026-10-01', amount_cents: 1200, occurrence_index: 0 }]);
    expect(plan.insert).toEqual([]);
    expect(plan.counts.changed).toBe(1);
  });

  it("divergência 'different' insere o novo e mantém o antigo como ausente (nada se perde)", () => {
    const before = parse(csv('2026-10-01,Mercado,"10,00"'));
    const after = parse(csv('2026-10-01,Mercado,"12,00"'));
    const result = reconcileInvoice(asExisting(before), after);
    const plan = buildImportPlan(result, asExisting(before), 1, { divergences: { e0: 'different' }, missing: {} }, [], []);
    expect(plan.insert).toHaveLength(1);
    expect(plan.missing).toEqual(['e0']);
  });

  it('ausentes: padrão mantém (marca para revisão); remoção exige decisão explícita', () => {
    const before = parse(csv('2026-10-01,Mercado,"10,00"', '2026-10-02,Padaria,"5,00"'));
    const after = parse(csv('2026-10-01,Mercado,"10,00"'));
    const result = reconcileInvoice(asExisting(before), after);
    const keep = buildImportPlan(result, asExisting(before), 1, none, [], []);
    expect(keep.missing).toEqual(['e1']);
    expect(keep.remove).toEqual([]);
    const remove = buildImportPlan(result, asExisting(before), 1, { divergences: {}, missing: { e1: 'remove' } }, [], []);
    expect(remove.remove).toEqual(['e1']);
  });

  it('vínculos confirmados vão no insert (itens novos) ou em link (itens existentes)', () => {
    const before = parse(csv('2026-10-01,Streaming,"150,00"'));
    const after = parse(csv('2026-10-01,Streaming,"150,00"', '2026-10-05,Academia,"90,00"'));
    const result = reconcileInvoice(asExisting(before), after);
    const plan = buildImportPlan(
      result, asExisting(before), 2, none,
      [{ ref: 'existing:e0', commitmentId: 'c1' }, { ref: 'new:1', commitmentId: 'c2' }], []
    );
    expect(plan.link).toEqual([{ item_id: 'e0', commitment_id: 'c1' }]);
    expect(plan.insert[0].commitment_id).toBe('c2');
  });

  it('pagamento recebido entra como item de pagamento e pode quitar a fatura anterior', () => {
    const rows = parse(csv('2026-09-28,Pagamento recebido,"- 2.565,37"', '2026-10-01,Mercado,"10,00"'));
    const plan = buildImportPlan(reconcileInvoice([], rows), [], 2, none, [], ['inv-set']);
    expect(plan.insert.find((i) => i.kind === 'payment')?.amount_cents).toBe(-256537);
    expect(plan.pay_invoice_ids).toEqual(['inv-set']);
  });
});


// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseNubankInvoiceCsv } from '@/modules/finance/cash/domain/nubank-invoice-csv';
import { reconcileInvoice, type ExistingInvoiceItem } from '@/modules/finance/cash/domain/reconcile';
import { buildImportPlan } from '@/modules/finance/cash/domain/import-plan';
import { mapRpcError } from '@/modules/finance/cash/infrastructure/invoice-import-service';

const csv = (...lines: string[]) => ['date,title,amount', ...lines].join('\n');
const parse = (text: string) => parseNubankInvoiceCsv(text).rows;
const asExisting = (rows: ReturnType<typeof parse>, cat = ''): ExistingInvoiceItem[] =>
  rows.map((r, i) => ({
    id: `e${i}`, date: r.date, normalizedDescription: r.normalizedDescription, amountCents: r.amountCents,
    kind: r.kind, occurrenceIndex: r.occurrenceIndex, status: 'active',
    installmentNo: r.installmentNo, installmentTotal: r.installmentTotal, classificationKey: `${cat}|`,
  }));
const none = { divergences: {}, missing: {} };

describe('conciliação v2', () => {
  it('CSV idêntico: tudo reconhecido, nada a decidir', () => {
    const rows = parse(csv('2026-10-09,Padaria,"8,00"', '2026-10-10,Mercado,"20,00"'));
    const r = reconcileInvoice(asExisting(rows), rows);
    expect(r.recognized).toHaveLength(2);
    expect(r.updates).toEqual([]);
    expect(r.divergences).toEqual([]);
  });

  it('CSV incremental: compras novas entram sem pedir nada', () => {
    const before = parse(csv('2026-10-09,Padaria,"8,00"'));
    const after = parse(csv('2026-10-09,Padaria,"8,00"', '2026-10-12,Posto,"100,00"'));
    const r = reconcileInvoice(asExisting(before), after);
    expect(r.recognized).toHaveLength(1);
    expect(r.newRows).toHaveLength(1);
    expect(r.divergences).toEqual([]);
  });

  it('parcela com data diferente e mesmo valor é atualização automática', () => {
    const before = parse(csv('2026-11-04,Amazon - Parcela 3/6,"31,85"'));
    const after = parse(csv('2026-10-21,Amazon - Parcela 3/6,"31,85"'));
    const r = reconcileInvoice(asExisting(before), after);
    expect(r.updates).toHaveLength(1);
    expect(r.updates[0].basis).toBe('installment');
    expect(r.newRows).toEqual([]);
    expect(r.missing).toEqual([]);
  });

  it('duas parcelas idênticas indo para a mesma data não colidem na chave única', () => {
    const before = parse(csv('2026-11-09,Passaro - Parcela 2/3,"29,08"', '2026-11-12,Passaro - Parcela 2/3,"29,08"'));
    const after = parse(csv('2026-10-21,Passaro - Parcela 2/3,"29,08"', '2026-10-21,Passaro - Parcela 2/3,"29,08"'));
    const ex = asExisting(before);
    const plan = buildImportPlan(reconcileInvoice(ex, after), ex, 2, none, [], []);
    expect(plan.update).toHaveLength(2);
    const keys = plan.update.map((u) => `${u.purchase_date}|${u.amount_cents}|${u.occurrence_index}`);
    expect(new Set(keys).size).toBe(2);
    expect(plan.insert).toEqual([]);
  });

  it('parcelas idênticas com categorias diferentes não são casadas sozinhas', () => {
    const before = parse(csv('2026-11-09,Passaro - Parcela 2/3,"29,08"', '2026-11-12,Passaro - Parcela 2/3,"29,08"'));
    const ex = asExisting(before).map((e, i) => ({ ...e, classificationKey: i === 0 ? 'a|' : 'b|' }));
    const after = parse(csv('2026-10-21,Passaro - Parcela 2/3,"29,08"', '2026-10-21,Passaro - Parcela 2/3,"29,08"'));
    expect(reconcileInvoice(ex, after).updates).toEqual([]);
  });

  it('mesma compra não parcelada com data muito diferente NÃO é atualizada sozinha', () => {
    const before = parse(csv('2026-10-01,Posto,"100,00"'));
    const after = parse(csv('2026-10-20,Posto,"100,00"'));
    const r = reconcileInvoice(asExisting(before), after);
    expect(r.updates).toEqual([]);
    expect(r.divergences).toHaveLength(1);
  });

  it('compra única com data próxima (até 3 dias) é atualizada automaticamente', () => {
    const r = reconcileInvoice(asExisting(parse(csv('2026-10-01,Posto,"100,00"'))), parse(csv('2026-10-03,Posto,"100,00"')));
    expect(r.updates).toHaveLength(1);
    expect(r.updates[0].basis).toBe('single_match');
  });

  it('duas compras legítimas idênticas nunca são fundidas', () => {
    const rows = parse(csv('2026-10-09,Streaming,"15,00"', '2026-10-09,Streaming,"15,00"'));
    const r = reconcileInvoice(asExisting(rows.slice(0, 1)), rows);
    expect(r.recognized).toHaveLength(1);
    expect(r.newRows).toHaveLength(1);
    expect(r.newRows[0].occurrenceIndex).toBe(1);
  });

  it('valor alterado nunca é automático: vira decisão', () => {
    const r = reconcileInvoice(asExisting(parse(csv('2026-10-01,Mercado,"10,00"'))), parse(csv('2026-10-01,Mercado,"12,00"')));
    expect(r.updates).toEqual([]);
    expect(r.divergences[0].reason).toBe('amount_changed');
  });

  it('concorrência entre candidatos: nada é casado, tudo vira ambíguo', () => {
    const before = parse(csv('2026-10-01,Mercado,"10,00"', '2026-10-01,Mercado,"10,00"'));
    const after = parse(csv('2026-10-01,Mercado,"11,00"'));
    const r = reconcileInvoice(asExisting(before), after);
    expect(r.divergences).toEqual([]);
    expect(r.ambiguous.length).toBeGreaterThan(0);
    expect(r.newRows).toHaveLength(1);
  });

  it('item removido do CSV fica ausente e não é removido automaticamente', () => {
    const before = parse(csv('2026-10-01,Mercado,"10,00"', '2026-10-02,Posto,"50,00"'));
    const after = parse(csv('2026-10-01,Mercado,"10,00"'));
    const ex = asExisting(before);
    const plan = buildImportPlan(reconcileInvoice(ex, after), ex, 1, none, [], []);
    expect(plan.missing).toEqual(['e1']);
    expect(plan.remove).toEqual([]);
  });

  it('pagamento da fatura anterior não vira atualização', () => {
    const before = parse(csv('2026-09-28,Pagamento recebido,"-100,00"'));
    const after = parse(csv('2026-09-29,Pagamento recebido,"-100,00"'));
    expect(reconcileInvoice(asExisting(before), after).updates).toEqual([]);
  });

  it('retentativa do mesmo plano é determinística', () => {
    const before = parse(csv('2026-11-04,Amazon - Parcela 3/6,"31,85"'));
    const after = parse(csv('2026-10-21,Amazon - Parcela 3/6,"31,85"'));
    const ex = asExisting(before);
    const a = buildImportPlan(reconcileInvoice(ex, after), ex, 1, none, [], []);
    const b = buildImportPlan(reconcileInvoice(ex, after), ex, 1, none, [], []);
    expect(a).toEqual(b);
  });
});

describe('erros da RPC', () => {
  it('mapeia conflito de unicidade, stale, rede e interno sem vazar detalhes', () => {
    expect(mapRpcError({ code: '23505', message: 'duplicate key ... (valor)' })).toMatchObject({ status: 409, category: 'conflict' });
    expect(mapRpcError({ code: 'P0001', message: 'STALE_INVOICE' })).toMatchObject({ status: 409, category: 'stale' });
    expect(mapRpcError({ message: 'fetch failed' })).toMatchObject({ status: 503, category: 'temporary' });
    expect(mapRpcError({ code: '22023', message: 'x' })).toMatchObject({ status: 400, category: 'invalid_data' });
    const internal = mapRpcError({ code: 'XX000', message: 'select * from secrets' });
    expect(internal.status).toBe(500);
    expect(internal.message).not.toMatch(/select|secrets/);
  });
});

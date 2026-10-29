// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { invoiceAmountCents, parseNubankInvoiceCsv } from '@/modules/finance/cash/domain/nubank-invoice-csv';
import { reconcileInvoice, type ExistingInvoiceItem } from '@/modules/finance/cash/domain/reconcile';
import { buildImportPlan } from '@/modules/finance/cash/domain/import-plan';
import { detectMisplacedImport, type OtherInvoiceItem } from '@/modules/finance/cash/domain/misplaced-import';
import { classifyCardFixed } from '@/modules/finance/cash/domain/projection';

const csv = (...lines: string[]) => ['date,title,amount', ...lines].join('\n');
const parse = (text: string) => parseNubankInvoiceCsv(text).rows;
const none = { divergences: {}, missing: {} };

/** Simula o que o banco guarda depois de aplicar um plano (só o que importa para os totais). */
function applyPlan(existing: ExistingInvoiceItem[], plan: ReturnType<typeof buildImportPlan>, rows: ReturnType<typeof parse>): ExistingInvoiceItem[] {
  const next = existing.map((e) => ({ ...e }));
  for (const ins of plan.insert) {
    const row = rows.find((r) => r.date === ins.purchase_date && r.normalizedDescription === ins.normalized_description && r.amountCents === ins.amount_cents)!;
    next.push({
      id: `n${next.length}`, date: ins.purchase_date, normalizedDescription: ins.normalized_description, amountCents: ins.amount_cents,
      kind: row.kind, occurrenceIndex: ins.occurrence_index, status: 'active',
    });
  }
  return next;
}
const total = (items: ExistingInvoiceItem[]) => invoiceAmountCents(items.filter((i) => i.status !== 'removed'));

function importOnce(existing: ExistingInvoiceItem[], rows: ReturnType<typeof parse>, decisions = none) {
  const result = reconcileInvoice(existing, rows);
  const plan = buildImportPlan(result, existing, rows.length, decisions, [], []);
  return { plan, result, items: applyPlan(existing, plan, rows) };
}

const v1 = csv(
  '2026-09-21,Mercado Bom,"100,00"',
  '2026-09-22,Uber *Viagem,"16,98"',
  '2026-09-22,Uber *Viagem,"16,98"', // compra legitimamente idêntica
  '2026-09-25,Estorno Loja,"-20,00"',
  '2026-10-01,Pagamento recebido,"-500,00"'
);

describe('regressão de importação de fatura (CSV Nubank sintético)', () => {
  it('o mesmo arquivo importado de novo (outro requestId) não altera nada nem soma de novo', () => {
    const rows = parse(v1);
    const first = importOnce([], rows);
    expect(total(first.items)).toBe(10000 + 1698 + 1698 - 2000); // pagamento fora da fatura
    const second = importOnce(first.items, rows);
    expect(second.plan.insert).toEqual([]);
    expect(second.plan.recognize).toHaveLength(rows.length);
    expect(second.plan.counts).toMatchObject({ new: 0, changed: 0, missing: 0 });
    expect(total(second.items)).toBe(total(first.items));
  });

  it('versão com uma linha a mais acrescenta só a nova; compras idênticas seguem como duas linhas', () => {
    const first = importOnce([], parse(v1));
    const v2 = parse(v1 + '\n2026-10-03,Padaria,"12,50"');
    const second = importOnce(first.items, v2);
    expect(second.plan.insert).toHaveLength(1);
    expect(second.plan.insert[0]).toMatchObject({ normalized_description: expect.stringContaining('padaria'), amount_cents: 1250 });
    expect(second.items.filter((i) => i.normalizedDescription.includes('uber')).length).toBe(2);
    expect(total(second.items)).toBe(total(first.items) + 1250);
  });

  it('terceira compra idêntica em versão nova entra como nova, sem fundir com as anteriores', () => {
    const first = importOnce([], parse(v1));
    const second = importOnce(first.items, parse(v1 + '\n2026-09-22,Uber *Viagem,"16,98"'));
    expect(second.plan.insert).toHaveLength(1);
    expect(second.plan.insert[0].occurrence_index).toBe(2);
  });

  it('divergência de valor ou data exige decisão e, se "mesmo lançamento", atualiza sem duplicar', () => {
    const first = importOnce([], parse(v1));
    const changed = parse(v1.replace('"100,00"', '"110,00"'));
    const result = reconcileInvoice(first.items, changed);
    expect(result.divergences).toHaveLength(1);
    expect(result.divergences[0].reason).toBe('amount_changed');
    const key = result.divergences[0].key;
    const plan = buildImportPlan(result, first.items, changed.length, { divergences: { [key]: 'same' }, missing: {} }, [], []);
    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([expect.objectContaining({ amount_cents: 11000 })]);
  });

  it('item ausente do arquivo novo continua contando (marcado para revisão) e nunca some em silêncio', () => {
    const first = importOnce([], parse(v1));
    const without = parse(v1.replace('2026-09-22,Uber *Viagem,"16,98"\n2026-09-22,Uber *Viagem,"16,98"\n', ''));
    const result = reconcileInvoice(first.items, without);
    expect(result.missing).toHaveLength(2);
    const plan = buildImportPlan(result, first.items, without.length, none, [], []);
    expect(plan.remove).toEqual([]);
    expect(plan.missing).toHaveLength(2);
  });

  it('estorno reduz e pagamento da fatura anterior não entra no valor da fatura', () => {
    const rows = parse(v1);
    expect(invoiceAmountCents(rows)).toBe(10000 + 1698 + 1698 - 2000);
    expect(rows.find((r) => r.normalizedDescription.includes('pagamento'))!.kind).toBe('payment');
  });
});

describe('importação para titular/mês errado é sinalizada', () => {
  const lucasOct: OtherInvoiceItem[] = parse(v1)
    .filter((r) => r.kind === 'purchase')
    .map((r) => ({ invoiceId: 'lucas-out', date: r.date, normalizedDescription: r.normalizedDescription, amountCents: r.amountCents }));

  it('arquivo de Lucas enviado para o cartão de Matheus (destino vazio) é suspeito', () => {
    expect(detectMisplacedImport(parse(v1), 0, lucasOct)).toMatchObject({ invoiceId: 'lucas-out', matchedRows: 3, totalRows: 3 });
  });

  it('reenvio legítimo para a fatura que já o reconhece não é suspeito', () => {
    expect(detectMisplacedImport(parse(v1), 3, lucasOct)).toBeNull();
  });

  it('uma ou duas compras iguais em outra fatura (coincidência) não disparam o aviso', () => {
    const rows = parse(csv('2026-09-21,Mercado Bom,"100,00"', '2026-09-30,Livraria,"50,00"', '2026-09-30,Cinema,"40,00"', '2026-10-02,Café,"9,00"'));
    expect(detectMisplacedImport(rows, 0, lucasOct)).toBeNull();
  });
});

describe('gasto fixo no cartão: real × previsto', () => {
  it('vinculado a um item importado não soma de novo', () => {
    expect(classifyCardFixed('pending', true, 'open')).toBe('reconciled');
  });
  it('marcado manualmente como já incluído não soma', () => {
    expect(classifyCardFixed('included_in_invoice', false, 'open')).toBe('manual_included');
  });
  it('ainda não apareceu em fatura aberta: único caso que soma como previsto', () => {
    expect(classifyCardFixed('pending', false, 'open')).toBe('awaiting_invoice');
    expect(classifyCardFixed('pending', false, null)).toBe('awaiting_invoice');
  });
  it('fatura fechada sem o item: não é somado nem escondido — fica como "não encontrado" para revisão', () => {
    expect(classifyCardFixed('pending', false, 'closed')).toBe('not_found_in_invoice');
  });
});

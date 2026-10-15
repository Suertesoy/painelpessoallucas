// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  parseNubankInvoiceCsv,
  parseBrlToCents,
  invoiceAmountCents,
  invoicePaymentsCents,
} from '@/modules/finance/cash/domain/nubank-invoice-csv';
import { reconcileInvoice, type ExistingInvoiceItem } from '@/modules/finance/cash/domain/reconcile';

const DIR = path.resolve(__dirname, '../../fixtures-privadas');
const REAL = ['Nubank_2026-09-28.csv', 'Nubank_2026-10-28.csv', 'Nubank_2026-11-28.csv'].map((f) => path.join(DIR, f));
const hasReal = REAL.every(existsSync);
const read = (i: number) => readFileSync(REAL[i], 'utf-8');

// Fixtures sintéticas com a mesma estrutura dos arquivos reais (rodam em qualquer ambiente).
const SYNTH = [
  'date,title,amount',
  '2026-10-14,Loja Passaro - Parcela 1/3,"29,09"',
  '2026-10-10,Loja Passaro - Parcela 1/3,"29,09"',
  '2026-10-09,Assinatura Streaming,"150,00"',
  '2026-10-09,Assinatura Streaming,"150,00"',
  '2026-09-28,Pagamento recebido,"- 2.565,37"',
  '2026-09-02,IOF de volta de Magnific,"- 2,88"',
  '2026-09-02,"IOF de ""Magnific""","2,88"',
].join('\n');

function toExisting(rows: ReturnType<typeof parseNubankInvoiceCsv>['rows']): ExistingInvoiceItem[] {
  return rows.map((r, i) => ({
    id: `e${i}`,
    date: r.date,
    normalizedDescription: r.normalizedDescription,
    amountCents: r.amountCents,
    kind: r.kind,
    occurrenceIndex: r.occurrenceIndex,
    status: 'active',
  }));
}

describe('valores monetários brasileiros', () => {
  it('interpreta positivos, negativos com espaço e milhar sem ponto flutuante', () => {
    expect(parseBrlToCents('29,08')).toBe(2908);
    expect(parseBrlToCents('- 2.565,37')).toBe(-256537);
    expect(parseBrlToCents('-2,88')).toBe(-288);
    expect(parseBrlToCents('1.234.567,89')).toBe(123456789);
    expect(parseBrlToCents('0,07')).toBe(7);
  });
  it('rejeita formatos inválidos', () => {
    expect(() => parseBrlToCents('12.5')).toThrow();
    expect(() => parseBrlToCents('abc')).toThrow();
  });
});

describe('parser da fatura Nubank (sintético)', () => {
  const { rows, errors } = parseNubankInvoiceCsv(SYNTH);
  it('lê sem erros e classifica pagamento, estorno de IOF e compra', () => {
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(7);
    expect(rows.find((r) => r.description === 'Pagamento recebido')?.kind).toBe('payment');
    expect(rows.find((r) => r.description.startsWith('IOF de volta'))?.kind).toBe('refund');
    expect(rows.find((r) => r.description === 'IOF de "Magnific"')?.kind).toBe('purchase');
  });
  it('mantém duas compras idênticas como ocorrências 0 e 1', () => {
    const subs = rows.filter((r) => r.description === 'Assinatura Streaming');
    expect(subs.map((s) => s.occurrenceIndex)).toEqual([0, 1]);
  });
  it('não funde parcelas iguais em datas diferentes e extrai parcela', () => {
    const p = rows.filter((r) => r.baseDescription === 'Loja Passaro');
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ installmentNo: 1, installmentTotal: 3 });
  });
  it('pagamento não entra no valor da fatura', () => {
    expect(invoiceAmountCents(rows)).toBe(2909 * 2 + 15000 * 2 - 288 + 288);
    expect(invoicePaymentsCents(rows)).toBe(256537);
  });
  it('rejeita cabeçalho diferente', () => {
    expect(parseNubankInvoiceCsv('a,b,c\n1,2,3').errors[0].message).toMatch(/Cabeçalho/);
  });
});

describe('reimportação e conciliação (sintético)', () => {
  const { rows } = parseNubankInvoiceCsv(SYNTH);
  it('reimportar o mesmo arquivo reconhece tudo e não cria nada', () => {
    const result = reconcileInvoice(toExisting(rows), rows);
    expect(result.recognized).toHaveLength(7);
    expect(result.newRows).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
    expect(result.divergences).toHaveLength(0);
  });
  it('versão mais recente da fatura aberta só adiciona o que é novo', () => {
    const older = parseNubankInvoiceCsv(SYNTH).rows;
    const newer = parseNubankInvoiceCsv(SYNTH + '\n2026-10-15,Padaria,"12,00"\n').rows;
    const result = reconcileInvoice(toExisting(older), newer);
    expect(result.newRows.map((n) => n.row.description)).toEqual(['Padaria']);
    expect(result.recognized).toHaveLength(7);
  });
  it('terceira compra idêntica é nova, com ocorrência livre', () => {
    const older = parseNubankInvoiceCsv(SYNTH).rows;
    const newer = parseNubankInvoiceCsv(SYNTH + '\n2026-10-09,Assinatura Streaming,"150,00"\n').rows;
    const result = reconcileInvoice(toExisting(older), newer);
    expect(result.newRows).toHaveLength(1);
    expect(result.newRows[0].occurrenceIndex).toBe(2);
  });
  it('valor alterado vira divergência para decisão, sem duplicar nem descartar', () => {
    const older = parseNubankInvoiceCsv('date,title,amount\n2026-10-01,Mercado,"10,00"').rows;
    const newer = parseNubankInvoiceCsv('date,title,amount\n2026-10-01,Mercado,"12,00"').rows;
    const result = reconcileInvoice(toExisting(older), newer);
    expect(result.divergences).toHaveLength(1);
    expect(result.divergences[0].reason).toBe('amount_changed');
    expect(result.newRows).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
  });
  it('item que sumiu do arquivo fica como ausente (não é apagado)', () => {
    const older = parseNubankInvoiceCsv(SYNTH).rows;
    const newer = parseNubankInvoiceCsv(SYNTH.split('\n').slice(0, -1).join('\n')).rows;
    const result = reconcileInvoice(toExisting(older), newer);
    expect(result.missing).toHaveLength(1);
  });
});

describe.skipIf(!hasReal)('arquivos reais do Nubank (fixtures-privadas)', () => {
  it('setembro: 61 lançamentos somando R$ 2.565,37, com estornos de IOF', () => {
    const { rows, errors } = parseNubankInvoiceCsv(read(0));
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(61);
    expect(rows.reduce((s, r) => s + r.amountCents, 0)).toBe(256537);
    expect(rows.filter((r) => r.kind === 'refund').length).toBeGreaterThan(0);
    expect(invoiceAmountCents(rows)).toBe(256537);
  });
  it('outubro: 29 lançamentos, soma bruta −R$ 1.264,88, pagamento de R$ 2.565,37 fora das compras', () => {
    const { rows, errors } = parseNubankInvoiceCsv(read(1));
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(29);
    expect(rows.reduce((s, r) => s + r.amountCents, 0)).toBe(-126488);
    const payments = rows.filter((r) => r.kind === 'payment');
    expect(payments).toHaveLength(1);
    expect(payments[0].amountCents).toBe(-256537);
    expect(invoicePaymentsCents(rows)).toBe(256537);
    // Compras novas = soma bruta + pagamento
    expect(invoiceAmountCents(rows)).toBe(-126488 + 256537);
  });
  it('novembro: 8 parcelas somando R$ 397,04, com duas linhas iguais em datas distintas', () => {
    const { rows } = parseNubankInvoiceCsv(read(2));
    expect(rows).toHaveLength(8);
    expect(rows.reduce((s, r) => s + r.amountCents, 0)).toBe(39704);
    const twins = rows.filter((r) => r.baseDescription === 'Passaro Marron Web');
    expect(twins).toHaveLength(2);
    expect(twins.map((t) => t.date).sort()).toEqual(['2026-11-09', '2026-11-12']);
    expect(rows.every((r) => r.installmentNo !== null)).toBe(true);
  });
  it('reimportar cada arquivo real é idempotente', () => {
    for (let i = 0; i < 3; i += 1) {
      const { rows } = parseNubankInvoiceCsv(read(i));
      const result = reconcileInvoice(toExisting(rows), rows);
      expect(result.recognized).toHaveLength(rows.length);
      expect(result.newRows).toHaveLength(0);
      expect(result.divergences).toHaveLength(0);
    }
  });
  it('parcelas de meses diferentes não são duplicatas entre si', () => {
    const oct = parseNubankInvoiceCsv(read(1)).rows;
    const nov = parseNubankInvoiceCsv(read(2)).rows;
    const keyOf = (r: (typeof oct)[number]) => `${r.date}|${r.normalizedDescription}|${r.amountCents}`;
    const octKeys = new Set(oct.map(keyOf));
    expect(nov.some((r) => octKeys.has(keyOf(r)))).toBe(false);
  });
});

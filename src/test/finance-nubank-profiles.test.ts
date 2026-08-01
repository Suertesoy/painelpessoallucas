// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { detectCsv, parseCsv, type CsvColumnMapping } from '@/modules/finance/domain/csv-parser';
import { computeDateRange } from '@/modules/finance/domain/date-range';
import { normalizeText } from '@/modules/finance/domain/normalize-text';
import { classifyTransaction, defaultNatureForAmount } from '@/modules/finance/domain/classification-engine';
import { expenseContributionCents } from '@/modules/finance/domain/money';
import { totalIncomeCents } from '@/modules/finance/domain/analytics';

/**
 * Fixtures SINTÉTICAS reproduzindo apenas as CARACTERÍSTICAS ESTRUTURAIS dos
 * dois layouts reais do Nubank descritos no pedido (seção 3) — nenhum dado
 * financeiro real. Cobre a seção 14 (fixtures e testes) e os itens 14/15/21
 * da lista de testes obrigatórios (seção 15).
 */

// ---------------------------------------------------------------------------
// 14.1 — Fatura do cartão Nubank (`date,title,amount`), ordem DECRESCENTE.
// ---------------------------------------------------------------------------
const NUBANK_CREDIT_CARD_FIXTURE = [
  'date,title,amount',
  '2026-06-17,Uber Trip,"25,90"',
  '2026-06-10,Loja Eletronicos Parcela 2/10,"1.234,56"',
  '2026-05-30,Pagamento recebido,"- 500,00"',
  '2026-05-25,Estorno Loja XYZ,"-45,90"',
  '2026-05-21,Supermercado Extra,"120,00"',
].join('\n');

describe('Fixture sintética — fatura Nubank (date,title,amount)', () => {
  const detection = detectCsv(NUBANK_CREDIT_CARD_FIXTURE);

  it('é reconhecida automaticamente como nubank_credit_card_statement, com confiança total', () => {
    expect(detection.profile).toBe('nubank_credit_card_statement');
    expect(detection.confident).toBe(true);
  });

  it('o mapeamento sugerido já resolve modo de sinal — nenhum mapeamento manual é necessário', () => {
    expect(detection.suggestedMapping.amountMode).toBe('card_positive_purchase');
    expect(detection.suggestedMapping.dateColumn).toBe('date');
    expect(detection.suggestedMapping.descriptionColumn).toBe('title');
    expect(detection.suggestedMapping.amountColumn).toBe('amount');
  });

  const parsed = parseCsv(NUBANK_CREDIT_CARD_FIXTURE, detection.delimiter, detection.suggestedMapping as CsvColumnMapping);

  it('parseia as 5 linhas, incluindo descrição de parcela', () => {
    expect(parsed).toHaveLength(5);
    expect(parsed.some((r) => r.description.includes('Parcela 2/10'))).toBe(true);
  });

  it('compra positiva (com vírgula decimal) vira saída canônica negativa', () => {
    const row = parsed.find((r) => r.description === 'Uber Trip')!;
    expect(row.amountCents).toBe(-2590);
    expect(row.sourceAmountCents).toBe(2590);
  });

  it('compra positiva com separador de milhar vira saída canônica negativa', () => {
    const row = parsed.find((r) => r.description.includes('Parcela 2/10'))!;
    expect(row.amountCents).toBe(-123456);
  });

  it('pagamento recebido negativo com espaço após o sinal vira crédito canônico, sem contribuição para gastos', () => {
    const row = parsed.find((r) => r.description === 'Pagamento recebido')!;
    expect(row.amountCents).toBe(50000);
    const suggestion = classifyTransaction(normalizeText(row.description), []);
    expect(suggestion.nature).toBe('invoice_payment');
    expect(expenseContributionCents('invoice_payment', row.amountCents)).toBe(0);
  });

  it('estorno negativo vira crédito canônico e reduz o gasto da categoria', () => {
    const row = parsed.find((r) => r.description === 'Estorno Loja XYZ')!;
    expect(row.amountCents).toBe(4590);
    const suggestion = classifyTransaction(normalizeText(row.description), []);
    expect(suggestion.nature).toBe('refund');
    expect(expenseContributionCents('refund', row.amountCents)).toBe(-4590);
  });

  it('compra sem regra de natureza cai no padrão pelo sinal (compra/saída)', () => {
    const row = parsed.find((r) => r.description === 'Supermercado Extra')!;
    expect(row.amountCents).toBe(-12000);
    const suggestion = classifyTransaction(normalizeText(row.description), []);
    expect(suggestion.nature ?? defaultNatureForAmount(row.amountCents)).toBe('purchase');
  });

  it('o intervalo de datas é calculado como menor/maior data (arquivo em ordem decrescente)', () => {
    const range = computeDateRange(parsed.map((r) => r.date));
    expect(range.start).toBe('2026-05-21');
    expect(range.end).toBe('2026-06-17');
  });
});

// ---------------------------------------------------------------------------
// 14.2 — Extrato Nubank (`Data,Valor,Identificador,Descrição`), ordem CRESCENTE.
// ---------------------------------------------------------------------------
const NUBANK_ACCOUNT_FIXTURE = [
  'Data,Valor,Identificador,Descrição',
  '01/06/2026,-89.90,11111111-1111-4111-8111-111111111111,Compra no débito - Mercado Bom Preço',
  '05/06/2026,-1200.00,22222222-2222-4222-8222-222222222222,Pagamento de fatura',
  '10/06/2026,500.00,33333333-3333-4333-8333-333333333333,Resgate RDB',
  '15/06/2026,300.00,44444444-4444-4444-8444-444444444444,Transferência Recebida',
  '20/06/2026,-150.00,55555555-5555-4555-8555-555555555555,Transferência enviada pelo Pix',
].join('\n');

describe('Fixture sintética — extrato Nubank (Data,Valor,Identificador,Descrição)', () => {
  const detection = detectCsv(NUBANK_ACCOUNT_FIXTURE);

  it('é reconhecida automaticamente como nubank_account_statement, com confiança total', () => {
    expect(detection.profile).toBe('nubank_account_statement');
    expect(detection.confident).toBe(true);
  });

  it('o mapeamento sugerido já resolve modo de sinal e identificador — nenhum mapeamento manual é necessário', () => {
    expect(detection.suggestedMapping.amountMode).toBe('signed');
    expect(detection.suggestedMapping.idColumn).toBe('Identificador');
  });

  const parsed = parseCsv(NUBANK_ACCOUNT_FIXTURE, detection.delimiter, detection.suggestedMapping as CsvColumnMapping);

  it('parseia as 5 movimentações com UUID sintético por linha', () => {
    expect(parsed).toHaveLength(5);
    expect(parsed.every((r) => r.externalId?.length === 36)).toBe(true);
  });

  it('o sinal já canônico do extrato é preservado (sem inversão)', () => {
    const debito = parsed.find((r) => r.description.includes('Compra no débito'))!;
    expect(debito.amountCents).toBe(-8990);
    expect(debito.sourceAmountCents).toBe(-8990);
  });

  it('compra no débito é sugerida como compra/despesa', () => {
    const debito = parsed.find((r) => r.description.includes('Compra no débito'))!;
    const suggestion = classifyTransaction(normalizeText(debito.description), []);
    expect(suggestion.nature ?? defaultNatureForAmount(debito.amountCents)).toBe('purchase');
  });

  it('pagamento de fatura tem contribuição zero — não duplica os gastos já lançados pelo cartão', () => {
    const pagamento = parsed.find((r) => r.description === 'Pagamento de fatura')!;
    const suggestion = classifyTransaction(normalizeText(pagamento.description), []);
    expect(suggestion.nature).toBe('invoice_payment');
    expect(expenseContributionCents('invoice_payment', pagamento.amountCents)).toBe(0);
  });

  it('resgate RDB não vira renda — natureza de movimentação interna, contribuição zero', () => {
    const resgate = parsed.find((r) => r.description === 'Resgate RDB')!;
    const suggestion = classifyTransaction(normalizeText(resgate.description), []);
    expect(suggestion.nature).toBe('transfer');
    expect(expenseContributionCents('transfer', resgate.amountCents)).toBe(0);
    // Renda mensal nunca é derivada de transações — só dos campos manuais.
    expect(totalIncomeCents({ matheusIncomeCents: 0, lucasIncomeCents: 0, otherIncomeCents: 0 })).toBe(0);
  });

  it('transferência recebida (sem Pix) é reconhecida como movimentação interna, mas nunca vira renda mensal automaticamente', () => {
    const recebida = parsed.find((r) => r.description === 'Transferência Recebida')!;
    const suggestion = classifyTransaction(normalizeText(recebida.description), []);
    expect(suggestion.nature).toBe('transfer');
  });

  it('Pix ambíguo (enviado) NÃO recebe natureza de transferência só por conter a palavra "transferência" — fica pendente para revisão manual', () => {
    const pix = parsed.find((r) => r.description.includes('Pix'))!;
    const suggestion = classifyTransaction(normalizeText(pix.description), []);
    expect(suggestion.nature).toBeNull();
    // Continua editável: cai no padrão pelo sinal (compra), nunca é travado.
    expect(defaultNatureForAmount(pix.amountCents)).toBe('purchase');
  });

  it('o intervalo de datas é calculado como menor/maior data e é o MESMO em ordem crescente ou decrescente', () => {
    const crescente = computeDateRange(parsed.map((r) => r.date));
    const decrescenteFixture = [...NUBANK_ACCOUNT_FIXTURE.split('\n').slice(1)].reverse();
    const decrescenteText = ['Data,Valor,Identificador,Descrição', ...decrescenteFixture].join('\n');
    const decrescenteDetection = detectCsv(decrescenteText);
    const decrescenteParsed = parseCsv(decrescenteText, decrescenteDetection.delimiter, decrescenteDetection.suggestedMapping as CsvColumnMapping);
    const decrescente = computeDateRange(decrescenteParsed.map((r) => r.date));

    expect(crescente).toEqual({ start: '2026-06-01', end: '2026-06-20' });
    expect(decrescente).toEqual(crescente);
  });
});

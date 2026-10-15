import { decodeCsvBuffer, detectDelimiter, tokenizeCsv } from '@/modules/finance/domain/csv-parser';
import { normalizeText } from '@/modules/finance/domain/normalize-text';

/**
 * Parser da fatura CSV do Nubank (`date,title,amount`).
 *
 * Convenção do arquivo preservada aqui: valor POSITIVO = cobrança contra o
 * cliente; NEGATIVO = crédito (pagamento da fatura anterior, estorno,
 * ajuste). Valores monetários sempre em centavos inteiros, por regex sobre a
 * string — nenhum ponto flutuante.
 */

export type InvoiceItemKind = 'purchase' | 'refund' | 'payment' | 'adjustment';

export interface ParsedInvoiceRow {
  /** Posição da linha no arquivo (0-based, sem contar cabeçalho). */
  rowIndex: number;
  date: string; // YYYY-MM-DD
  description: string; // original
  normalizedDescription: string;
  amountCents: number; // + cobrança, − crédito
  kind: InvoiceItemKind;
  installmentNo: number | null;
  installmentTotal: number | null;
  /** Descrição da compra sem o sufixo "- Parcela N/M". */
  baseDescription: string;
  /** n-ésima ocorrência de (data, descrição, valor) idênticos neste arquivo. */
  occurrenceIndex: number;
}

export interface InvoiceCsvParseResult {
  rows: ParsedInvoiceRow[];
  errors: { line: number; message: string }[];
}

const BRL_AMOUNT = /^(-)?\s*(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})$/;

/** "- 2.565,37" -> -256537; "29,08" -> 2908. Lança em formato inválido. */
export function parseBrlToCents(raw: string): number {
  const match = raw.trim().replace(/^R\$\s*/i, '').match(BRL_AMOUNT);
  if (!match) throw new Error(`Valor monetário inválido: "${raw}"`);
  const [, sign, intPart, frac] = match;
  const cents = Number(intPart.replace(/\./g, '')) * 100 + Number(frac);
  if (!Number.isSafeInteger(cents)) throw new Error(`Valor fora do intervalo: "${raw}"`);
  return sign ? -cents : cents;
}

const INSTALLMENT = /\s*-?\s*parcela\s+(\d{1,3})\s*\/\s*(\d{1,3})\s*$/i;

export function parseInstallment(description: string): {
  base: string;
  no: number | null;
  total: number | null;
} {
  const match = description.match(INSTALLMENT);
  if (!match) return { base: description.trim(), no: null, total: null };
  const no = Number(match[1]);
  const total = Number(match[2]);
  if (no < 1 || total < 1 || no > total) return { base: description.trim(), no: null, total: null };
  return { base: description.replace(INSTALLMENT, '').trim(), no, total };
}

export function classifyInvoiceItem(normalizedDescription: string, amountCents: number): InvoiceItemKind {
  if (amountCents < 0 && /^pagamento (recebido|em|de fatura)/.test(normalizedDescription)) return 'payment';
  if (amountCents < 0) {
    return /estorno|de volta|reembolso|devolucao|cancelamento/.test(normalizedDescription) ? 'refund' : 'adjustment';
  }
  return 'purchase';
}

export function parseNubankInvoiceCsv(text: string): InvoiceCsvParseResult {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = detectDelimiter(firstLine);
  const table = tokenizeCsv(clean, delimiter);
  const errors: { line: number; message: string }[] = [];
  if (table.length === 0) return { rows: [], errors: [{ line: 1, message: 'Arquivo vazio.' }] };

  const header = table[0].map((h) => h.trim().toLowerCase());
  if (header.join(',') !== 'date,title,amount') {
    return {
      rows: [],
      errors: [{ line: 1, message: 'Cabeçalho não reconhecido. Esperado: date,title,amount (fatura Nubank).' }],
    };
  }

  const rows: ParsedInvoiceRow[] = [];
  const seen = new Map<string, number>();
  table.slice(1).forEach((cols, i) => {
    const line = i + 2;
    if (cols.length !== 3) {
      errors.push({ line, message: 'Linha com número de colunas inesperado.' });
      return;
    }
    const [dateRaw, titleRaw, amountRaw] = cols;
    const date = dateRaw.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push({ line, message: 'Data inválida (esperado AAAA-MM-DD).' });
      return;
    }
    const description = titleRaw.trim();
    if (!description) {
      errors.push({ line, message: 'Descrição vazia.' });
      return;
    }
    let amountCents: number;
    try {
      amountCents = parseBrlToCents(amountRaw);
    } catch (e) {
      errors.push({ line, message: e instanceof Error ? e.message : 'Valor inválido.' });
      return;
    }
    const normalizedDescription = normalizeText(description);
    const installment = parseInstallment(description);
    const key = `${date}|${normalizedDescription}|${amountCents}`;
    const occurrenceIndex = seen.get(key) ?? 0;
    seen.set(key, occurrenceIndex + 1);
    rows.push({
      rowIndex: i,
      date,
      description,
      normalizedDescription,
      amountCents,
      kind: classifyInvoiceItem(normalizedDescription, amountCents),
      installmentNo: installment.no,
      installmentTotal: installment.total,
      baseDescription: installment.base,
      occurrenceIndex,
    });
  });

  return { rows, errors };
}

export function parseNubankInvoiceBuffer(buffer: ArrayBuffer): InvoiceCsvParseResult {
  return parseNubankInvoiceCsv(decodeCsvBuffer(buffer).text);
}

/** Valor da fatura = compras + estornos/ajustes; pagamentos ficam de fora. */
export function invoiceAmountCents(items: readonly { kind: InvoiceItemKind; amountCents: number }[]): number {
  return items.reduce((sum, it) => (it.kind === 'payment' ? sum : sum + it.amountCents), 0);
}

export function invoicePaymentsCents(items: readonly { kind: InvoiceItemKind; amountCents: number }[]): number {
  return items.reduce((sum, it) => (it.kind === 'payment' ? sum + Math.abs(it.amountCents) : sum), 0);
}

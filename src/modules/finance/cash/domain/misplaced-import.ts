import type { ParsedInvoiceRow } from './nubank-invoice-csv';

/**
 * Detecta importação provavelmente enviada para o cartão/mês ERRADO: se a maior
 * parte das compras do arquivo já existe, idêntica (data, descrição, valor), em
 * OUTRA fatura, o mais provável é reenvio do arquivo para o destino errado — o
 * que duplicaria despesas. Só avisa; quem decide é o usuário.
 */

export interface OtherInvoiceItem {
  invoiceId: string;
  date: string;
  normalizedDescription: string;
  amountCents: number;
}

export interface MisplacedImportSuspicion {
  invoiceId: string;
  matchedRows: number;
  totalRows: number;
}

export const MISPLACED_MIN_MATCHES = 3;
export const MISPLACED_MIN_RATIO = 0.6;

const key = (date: string, norm: string, amount: number) => `${date}|${norm}|${amount}`;

export function detectMisplacedImport(
  incoming: readonly Pick<ParsedInvoiceRow, 'date' | 'normalizedDescription' | 'amountCents' | 'kind'>[],
  /** Linhas do arquivo que JÁ têm correspondência na fatura de destino (essas não contam como suspeitas). */
  alreadyInTarget: number,
  others: readonly OtherInvoiceItem[]
): MisplacedImportSuspicion | null {
  const purchases = incoming.filter((r) => r.kind === 'purchase');
  if (purchases.length === 0) return null;
  // Destino já reconhece o arquivo (reenvio legítimo de fatura aberta): não é suspeito.
  if (alreadyInTarget >= purchases.length * MISPLACED_MIN_RATIO) return null;

  const byInvoice = new Map<string, Map<string, number>>();
  for (const o of others) {
    const m = byInvoice.get(o.invoiceId) ?? new Map<string, number>();
    const k = key(o.date, o.normalizedDescription, o.amountCents);
    m.set(k, (m.get(k) ?? 0) + 1);
    byInvoice.set(o.invoiceId, m);
  }

  let best: MisplacedImportSuspicion | null = null;
  for (const [invoiceId, counts] of byInvoice) {
    const left = new Map(counts);
    let matched = 0;
    for (const r of purchases) {
      const k = key(r.date, r.normalizedDescription, r.amountCents);
      const n = left.get(k) ?? 0;
      if (n > 0) {
        left.set(k, n - 1);
        matched += 1;
      }
    }
    if (matched >= MISPLACED_MIN_MATCHES && matched / purchases.length >= MISPLACED_MIN_RATIO && (!best || matched > best.matchedRows)) {
      best = { invoiceId, matchedRows: matched, totalRows: purchases.length };
    }
  }
  return best;
}

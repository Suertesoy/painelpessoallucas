import { normalizeText } from '@/modules/finance/domain/normalize-text';
import type { CardId } from './month';

/**
 * Sugestões de vínculo entre um item de fatura e um compromisso recorrente
 * cobrado no cartão. Só sugere — nunca vincula sozinho. Valor igual +
 * nome parecido = confiança alta; só um dos dois = baixa (revisão).
 */

export interface LinkableCommitment {
  id: string;
  description: string;
  amountCents: number;
  card: CardId | null;
}

export interface LinkableItem {
  id: string;
  normalizedDescription: string;
  amountCents: number;
  kind: string;
  commitmentId: string | null;
}

export interface LinkSuggestion {
  itemId: string;
  commitmentId: string;
  confidence: 'high' | 'low';
  reason: 'name_and_amount' | 'name_only' | 'amount_only';
}

function tokens(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter((t) => t.length >= 4);
}

function namesOverlap(commitmentDescription: string, itemNormalized: string): boolean {
  const itemTokens = new Set(tokens(itemNormalized));
  return tokens(commitmentDescription).some((t) => itemTokens.has(t) || itemNormalized.includes(t));
}

export function suggestCommitmentLinks(
  items: readonly LinkableItem[],
  commitments: readonly LinkableCommitment[],
  card: CardId
): LinkSuggestion[] {
  const candidates = commitments.filter((c) => c.card === card);
  const alreadyLinked = new Set(items.filter((i) => i.commitmentId).map((i) => i.commitmentId as string));
  const suggestions: LinkSuggestion[] = [];
  const claimed = new Set<string>();

  for (const c of candidates) {
    if (alreadyLinked.has(c.id)) continue;
    const pool = items.filter((i) => i.kind === 'purchase' && !i.commitmentId && !claimed.has(i.id));
    const both = pool.find((i) => i.amountCents === c.amountCents && namesOverlap(c.description, i.normalizedDescription));
    if (both) {
      claimed.add(both.id);
      suggestions.push({ itemId: both.id, commitmentId: c.id, confidence: 'high', reason: 'name_and_amount' });
      continue;
    }
    const nameOnly = pool.find((i) => namesOverlap(c.description, i.normalizedDescription));
    if (nameOnly) {
      claimed.add(nameOnly.id);
      suggestions.push({ itemId: nameOnly.id, commitmentId: c.id, confidence: 'low', reason: 'name_only' });
      continue;
    }
    const amountOnly = pool.filter((i) => i.amountCents === c.amountCents);
    if (amountOnly.length === 1) {
      claimed.add(amountOnly[0].id);
      suggestions.push({ itemId: amountOnly[0].id, commitmentId: c.id, confidence: 'low', reason: 'amount_only' });
    }
  }
  return suggestions;
}

/**
 * Um "Pagamento recebido" de um arquivo costuma quitar a fatura anterior.
 * Devolve a fatura candidata (mesmo cartão, valor idêntico, ainda não paga).
 */
export function matchPaymentToInvoice(
  paymentCents: number,
  invoices: readonly { id: string; amountCents: number | null; status: 'open' | 'closed' | 'paid' }[]
): string | null {
  const exact = invoices.filter((i) => i.status !== 'paid' && i.amountCents === Math.abs(paymentCents));
  return exact.length === 1 ? exact[0].id : null;
}

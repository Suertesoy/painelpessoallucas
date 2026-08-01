/**
 * Aritmética monetária do módulo Finanças — sempre em centavos inteiros.
 *
 * Convenção canônica única, válida em toda a base: valor NEGATIVO é saída de
 * dinheiro, valor POSITIVO é entrada de dinheiro. Arquivos de cartão que
 * representam compra como número positivo são invertidos na importação
 * (ver `csv-parser.ts`, `amountMode: 'card_positive_purchase'`) — o restante
 * do sistema nunca precisa saber a convenção original do arquivo.
 */

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** Formata centavos inteiros como moeda brasileira (ex.: -4590 -> "-R$ 45,90"). */
export function centsToBRL(cents: number): string {
  return BRL_FORMATTER.format(cents / 100);
}

export function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function absCents(cents: number): number {
  return Math.abs(cents);
}

/**
 * Contribuição de uma transação confirmada para "gastos do mês", segundo a
 * convenção de sinal: compra/tarifa (saída negativa) aumenta o gasto pelo
 * valor absoluto; estorno (entrada positiva) reduz o gasto da mesma
 * categoria; pagamento de fatura, transferência, crédito não identificado e
 * item ignorado contribuem zero.
 */
export function expenseContributionCents(nature: string, amountCents: number): number {
  if (nature === 'purchase' || nature === 'fee') return absCents(amountCents);
  if (nature === 'refund') return -absCents(amountCents);
  return 0;
}

export function roundPercentage(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

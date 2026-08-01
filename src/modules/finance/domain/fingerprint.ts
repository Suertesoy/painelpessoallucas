/**
 * Impressão digital determinística de uma linha importada sem identificador
 * (CSV). Usada só como SINAL de possível duplicidade na revisão — nunca
 * descarta uma linha silenciosamente; duas compras legítimas com a mesma
 * impressão digital continuam sendo preservadas, só marcadas para conferência.
 */
export interface RowFingerprintInput {
  sourceId: string;
  date: string; // YYYY-MM-DD
  amountCents: number;
  normalizedDescription: string;
}

export function buildRowFingerprint(input: RowFingerprintInput): string {
  return `${input.sourceId}|${input.date}|${input.amountCents}|${input.normalizedDescription}`;
}

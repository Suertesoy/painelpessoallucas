/**
 * Conversão entre texto digitado pelo usuário e centavos inteiros, sem
 * ponto flutuante. Aceita "1.234,56", "1234,56", "1234" (reais inteiros) e
 * "1234.56" (ponto com exatamente 2 casas decimais).
 */
export function parseMoneyInput(text: string): number | null {
  const raw = text.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!raw) return null;
  let negative = false;
  let value = raw;
  if (value.startsWith('-')) {
    negative = true;
    value = value.slice(1);
  }
  let match = value.match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/);
  if (!match) match = value.match(/^(\d+)(?:\.(\d{2}))$/);
  if (!match) return null;
  const intPart = match[1].replace(/\./g, '');
  const frac = (match[2] ?? '').padEnd(2, '0');
  const cents = Number(intPart) * 100 + Number(frac);
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** Centavos -> texto editável ("1234,50"), sem símbolo de moeda. */
export function centsToInput(cents: number): string {
  const abs = Math.abs(cents);
  const text = `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
  return cents < 0 ? `-${text}` : text;
}

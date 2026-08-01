/**
 * Normalização de texto para comparação (classificação, impressão digital de
 * duplicidade). A descrição ORIGINAL do lançamento nunca é descartada — só a
 * versão normalizada é usada para comparar.
 *
 * Remove acentos decompondo em NFD e descartando marcas combinantes
 * (`\p{M}`, Unicode property escape — evita depender de uma faixa de
 * caracteres escrita à mão, que é frágil entre editores/encodings).
 */
const DIACRITIC_MARK = /\p{M}/gu;
const NON_ALPHANUMERIC = /[^a-z0-9\s]/g;
const EXTRA_WHITESPACE = /\s+/g;

export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(DIACRITIC_MARK, '')
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, ' ')
    .replace(EXTRA_WHITESPACE, ' ')
    .trim();
}

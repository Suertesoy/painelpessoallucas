/**
 * Validação do endpoint de uma assinatura Web Push — a credencial de
 * entrega em si. Rejeita formatos evidentemente inválidos, HTTP simples e
 * hosts locais/privados (nunca é isso que um serviço de push real usa).
 */

const PRIVATE_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
];

export function isValidPushEndpoint(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (PRIVATE_HOSTNAME_PATTERNS.some((pattern) => pattern.test(url.hostname))) return false;
  return true;
}

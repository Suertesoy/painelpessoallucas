/**
 * Hash de texto usado para saber, de forma barata e confiável, se um trecho
 * de texto já analisado por IA mudou desde a análise (ver ai_runs.input_hash).
 * Web Crypto (`crypto.subtle`) funciona tanto no servidor (Node/Edge) quanto
 * no navegador — mesma função em ambos os lados.
 */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

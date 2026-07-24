import 'server-only';

/**
 * Rate limit simples em memória, por instância de servidor. Suficiente para
 * um painel de uso pessoal (poucos usuários); não é distribuído — em
 * múltiplas instâncias/cold starts o contador reinicia. Documentado aqui
 * como limitação conhecida, não escondida.
 */

const windows = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(key: string, maxPerWindow: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = windows.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
    windows.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= maxPerWindow) {
    return false;
  }

  entry.count += 1;
  return true;
}

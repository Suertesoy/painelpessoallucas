/**
 * Sugestões simples para Compras, só com o histórico da própria lista — sem IA:
 *  - "Você quis dizer…?" quando o que foi digitado é quase um item já conhecido;
 *  - itens recorrentes que costumam voltar à lista (e talvez já estejam na hora).
 * Tudo é sugestão: nada é corrigido nem adicionado sem um toque.
 */

export interface ShoppingHistoryEntry {
  title: string;
  createdAt: string;
  completedAt?: string;
}

export interface KnownItem {
  key: string;
  /** Como o item costuma ser escrito (a grafia mais recente). */
  label: string;
  /** Quantas vezes já foi adicionado. */
  count: number;
  lastAddedAt: string;
  /** Intervalo médio entre as adições, em dias (nulo com menos de 2 adições). */
  avgIntervalDays: number | null;
}

const DAY_MS = 86_400_000;

export function normalizeItemKey(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Agrupa o histórico (inclui itens já comprados e "limpos") por item conhecido. */
export function buildKnownItems(history: ShoppingHistoryEntry[]): KnownItem[] {
  const groups = new Map<string, ShoppingHistoryEntry[]>();
  for (const entry of history) {
    const key = normalizeItemKey(entry.title);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }
  const result: KnownItem[] = [];
  for (const [key, entries] of groups) {
    const sorted = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const times = sorted.map((e) => new Date(e.createdAt).getTime());
    const gaps = times.slice(1).map((t, i) => (t - times[i]) / DAY_MS).filter((g) => g >= 0.5);
    const latest = sorted[sorted.length - 1];
    result.push({
      key,
      label: latest.title.trim(),
      count: sorted.length,
      lastAddedAt: latest.createdAt,
      avgIntervalDays: gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
    });
  }
  return result;
}

/** Distância de edição com transposição de letras vizinhas ("leite" ↔ "liete" = 1). */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * Se o texto digitado NÃO é um item conhecido mas está a 1 letra (itens curtos)
 * ou 2 letras (itens longos) de um que é, devolve esse item. Em empate vale o
 * mais frequente. Palavras muito curtas (≤3 letras) nunca geram sugestão.
 */
export function suggestCorrection(input: string, known: KnownItem[]): KnownItem | null {
  const key = normalizeItemKey(input);
  if (key.length <= 3) return null;
  if (known.some((k) => k.key === key)) return null;
  const maxDistance = key.length >= 7 ? 2 : 1;
  let best: { item: KnownItem; distance: number } | null = null;
  for (const item of known) {
    if (Math.abs(item.key.length - key.length) > maxDistance) continue;
    const distance = editDistance(key, item.key);
    if (distance === 0 || distance > maxDistance) continue;
    if (!best || distance < best.distance || (distance === best.distance && item.count > best.item.count)) {
      best = { item, distance };
    }
  }
  return best?.item ?? null;
}

export interface RecurringSuggestion {
  label: string;
  /** "due" = já passou do intervalo habitual; "frequent" = costuma estar na lista. */
  reason: 'due' | 'frequent';
  count: number;
}

/**
 * Itens recorrentes que ainda NÃO estão pendentes. Primeiro os que já passaram
 * do intervalo habitual (≥ 70%); depois os mais frequentes. Mínimo de 2 vezes.
 */
export function suggestRecurring(
  known: KnownItem[],
  pendingKeys: Set<string>,
  now: Date,
  limit = 8
): RecurringSuggestion[] {
  const candidates = known.filter((k) => k.count >= 2 && !pendingKeys.has(k.key));
  const withRatio = candidates.map((k) => {
    const days = (now.getTime() - new Date(k.lastAddedAt).getTime()) / DAY_MS;
    return { k, ratio: k.avgIntervalDays ? days / k.avgIntervalDays : 0 };
  });
  const due = withRatio
    .filter((x) => x.k.avgIntervalDays !== null && x.ratio >= 0.7)
    .sort((a, b) => b.ratio - a.ratio || b.k.count - a.k.count);
  const dueKeys = new Set(due.map((x) => x.k.key));
  const frequent = withRatio
    .filter((x) => !dueKeys.has(x.k.key) && x.k.count >= 3)
    .sort((a, b) => b.k.count - a.k.count);
  return [
    ...due.map((x) => ({ label: x.k.label, reason: 'due' as const, count: x.k.count })),
    ...frequent.map((x) => ({ label: x.k.label, reason: 'frequent' as const, count: x.k.count })),
  ].slice(0, limit);
}

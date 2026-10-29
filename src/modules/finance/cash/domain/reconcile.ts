import type { InvoiceItemKind, ParsedInvoiceRow } from './nubank-invoice-csv';

/**
 * Conciliação de uma nova versão de CSV com os itens já conhecidos da MESMA
 * fatura (cartão + mês). Estratégia conservadora:
 *
 *  1. Identidade = (data, descrição normalizada, valor) + n-ésima ocorrência.
 *     Duas compras idênticas no mesmo dia são DUAS linhas, nunca fundidas.
 *  2. Itens com a mesma identidade são "reconhecidos" — nada é reinserido.
 *  3. Atualização confiável (automática, sem perguntar): sobras com mesma
 *     descrição, tipo e VALOR, só a data diferente, quando a cardinalidade
 *     fecha (n existentes = n do arquivo) e
 *       - são parcelas ("Parcela N/M"): a data de parcela no CSV do Nubank
 *         muda entre exportações, então a identidade é descrição+parcela+valor; ou
 *       - é 1 para 1 e a data mudou até 3 dias.
 *     Com n > 1 exige categoria/vínculo idênticos entre os existentes (assim
 *     nenhum id/categoria troca de lugar). Valor diferente NUNCA é automático.
 *  4. Sobras com mesma descrição e só data OU valor diferente viram
 *     "divergências" SOMENTE se o par for mútuo e único (um candidato para
 *     cada lado). Qualquer concorrência vira "ambígua": não se casa nada,
 *     as linhas entram como novas e as antigas ficam ausentes para revisão.
 *  5. Item conhecido que sumiu do arquivo e não tem par é "ausente": continua
 *     contando até o usuário confirmar a remoção (nunca some em silêncio).
 */

export type ExistingItemStatus = 'active' | 'missing' | 'removed';

export interface ExistingInvoiceItem {
  id: string;
  date: string;
  normalizedDescription: string;
  amountCents: number;
  kind: InvoiceItemKind;
  occurrenceIndex: number;
  status: ExistingItemStatus;
  installmentNo?: number | null;
  installmentTotal?: number | null;
  /** Categoria + vínculo atuais; usado só para não trocar classificações de lugar. */
  classificationKey?: string;
}

export interface TrustedUpdate {
  existing: ExistingInvoiceItem;
  row: ParsedInvoiceRow;
  basis: 'installment' | 'single_match';
}

export interface Divergence {
  /** Chave estável da divergência para o par de decisão. */
  key: string;
  existing: ExistingInvoiceItem;
  incoming: ParsedInvoiceRow;
  reason: 'amount_changed' | 'date_changed';
}

export interface NewInvoiceRow {
  row: ParsedInvoiceRow;
  /** Índice de ocorrência garantidamente livre para a chave da linha. */
  occurrenceIndex: number;
}

export interface ReconcileResult {
  recognized: { existing: ExistingInvoiceItem; row: ParsedInvoiceRow }[];
  /** Atualizações de data seguras, aplicadas sem decisão do usuário. */
  updates: TrustedUpdate[];
  /** Existentes sem par único (concorrência entre candidatos): revisão obrigatória. */
  ambiguous: ExistingInvoiceItem[];
  /** Linhas sem correspondência e sem par de divergência. */
  newRows: NewInvoiceRow[];
  /** Itens conhecidos ausentes do arquivo, sem par de divergência. */
  missing: ExistingInvoiceItem[];
  divergences: Divergence[];
}

function identity(date: string, norm: string, amount: number): string {
  return `${date}|${norm}|${amount}`;
}

function dayDistance(a: string, b: string): number {
  const toDays = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    return y * 372 + (m - 1) * 31 + day;
  };
  return Math.abs(toDays(a) - toDays(b));
}

export function reconcileInvoice(existing: readonly ExistingInvoiceItem[], incoming: readonly ParsedInvoiceRow[]): ReconcileResult {
  const live = existing.filter((e) => e.status !== 'removed');
  const existingByKey = new Map<string, ExistingInvoiceItem[]>();
  const maxIndexByKey = new Map<string, number>();
  for (const e of existing) {
    const key = identity(e.date, e.normalizedDescription, e.amountCents);
    maxIndexByKey.set(key, Math.max(maxIndexByKey.get(key) ?? -1, e.occurrenceIndex));
  }
  for (const e of live) {
    const key = identity(e.date, e.normalizedDescription, e.amountCents);
    const list = existingByKey.get(key) ?? [];
    list.push(e);
    existingByKey.set(key, list);
  }
  for (const list of existingByKey.values()) list.sort((a, b) => a.occurrenceIndex - b.occurrenceIndex);

  const incomingByKey = new Map<string, ParsedInvoiceRow[]>();
  for (const r of incoming) {
    const key = identity(r.date, r.normalizedDescription, r.amountCents);
    const list = incomingByKey.get(key) ?? [];
    list.push(r);
    incomingByKey.set(key, list);
  }

  const recognized: ReconcileResult['recognized'] = [];
  const leftoverExisting: ExistingInvoiceItem[] = [];
  const leftoverIncoming: ParsedInvoiceRow[] = [];

  const keys = new Set([...existingByKey.keys(), ...incomingByKey.keys()]);
  for (const key of keys) {
    const ex = existingByKey.get(key) ?? [];
    const inc = (incomingByKey.get(key) ?? []).slice().sort((a, b) => a.occurrenceIndex - b.occurrenceIndex);
    const paired = Math.min(ex.length, inc.length);
    for (let i = 0; i < paired; i += 1) recognized.push({ existing: ex[i], row: inc[i] });
    leftoverExisting.push(...ex.slice(paired));
    leftoverIncoming.push(...inc.slice(paired));
  }

  // Atualizações confiáveis (só a data muda; ver cabeçalho).
  const updates: TrustedUpdate[] = [];
  const usedIncoming = new Set<ParsedInvoiceRow>();
  const pairedExisting = new Set<ExistingInvoiceItem>();
  const groupKey = (kind: string, norm: string, amount: number) => `${kind}|${norm}|${amount}`;
  const exGroups = new Map<string, ExistingInvoiceItem[]>();
  const inGroups = new Map<string, ParsedInvoiceRow[]>();
  for (const e of leftoverExisting) {
    const k = groupKey(e.kind, e.normalizedDescription, e.amountCents);
    exGroups.set(k, [...(exGroups.get(k) ?? []), e]);
  }
  for (const r of leftoverIncoming) {
    const k = groupKey(r.kind, r.normalizedDescription, r.amountCents);
    inGroups.set(k, [...(inGroups.get(k) ?? []), r]);
  }
  for (const [k, ex] of exGroups) {
    const inc = inGroups.get(k);
    if (!inc || ex.length !== inc.length || ex[0].kind !== 'purchase') continue;
    const isInstallment = inc.every((r) => r.installmentNo !== null);
    if (!isInstallment && !(ex.length === 1 && dayDistance(ex[0].date, inc[0].date) <= 3)) continue;
    if (ex.length > 1 && new Set(ex.map((e) => e.classificationKey ?? '')).size > 1) continue;
    const exSorted = ex.slice().sort((a, b) => a.date.localeCompare(b.date) || a.occurrenceIndex - b.occurrenceIndex);
    const inSorted = inc.slice().sort((a, b) => a.date.localeCompare(b.date) || a.rowIndex - b.rowIndex);
    exSorted.forEach((e, i) => {
      updates.push({ existing: e, row: inSorted[i], basis: isInstallment ? 'installment' : 'single_match' });
      pairedExisting.add(e);
      usedIncoming.add(inSorted[i]);
    });
  }

  // Divergências: par mútuo e único (só data OU só valor mudou). Concorrência = ambígua.
  const divergences: Divergence[] = [];
  const ambiguous: ExistingInvoiceItem[] = [];
  const restExisting = leftoverExisting.filter((e) => !pairedExisting.has(e));
  const restIncoming = leftoverIncoming.filter((r) => !usedIncoming.has(r));
  const plausible = (e: ExistingInvoiceItem, r: ParsedInvoiceRow) =>
    r.normalizedDescription === e.normalizedDescription && r.kind === e.kind && (r.date === e.date) !== (r.amountCents === e.amountCents);
  for (const e of restExisting.slice().sort((a, b) => a.date.localeCompare(b.date) || a.occurrenceIndex - b.occurrenceIndex)) {
    const cands = restIncoming.filter((r) => plausible(e, r));
    if (cands.length === 0) continue;
    if (cands.length > 1 || restExisting.filter((o) => plausible(o, cands[0])).length > 1) {
      ambiguous.push(e);
      continue;
    }
    const best = cands[0];
    usedIncoming.add(best);
    pairedExisting.add(e);
    divergences.push({ key: e.id, existing: e, incoming: best, reason: best.date === e.date ? 'amount_changed' : 'date_changed' });
  }

  const missing = leftoverExisting.filter((e) => !pairedExisting.has(e));

  const nextFree = new Map<string, number>();
  const newRows: NewInvoiceRow[] = [];
  for (const r of leftoverIncoming) {
    if (usedIncoming.has(r)) continue;
    const key = identity(r.date, r.normalizedDescription, r.amountCents);
    const next = nextFree.get(key) ?? (maxIndexByKey.get(key) ?? -1) + 1;
    newRows.push({ row: r, occurrenceIndex: next });
    nextFree.set(key, next + 1);
  }

  return { recognized, updates, ambiguous, newRows, missing, divergences };
}

export function describeReconcile(result: ReconcileResult) {
  return {
    recognized: result.recognized.length,
    new: result.newRows.length,
    missing: result.missing.length,
    updated: result.updates.length,
    ambiguous: result.ambiguous.length,
    divergences: result.divergences.length,
    needsReview: result.divergences.length + result.missing.length,
  };
}

import { XMLParser } from 'fast-xml-parser';
import { computeDateRange } from './date-range';

/**
 * Parser OFX estrutural — cobre OFX 2.x (XML bem formado) e OFX 1.x (SGML,
 * tags sem fechamento para valores-folha). Nenhuma das duas variações é
 * tratada só com regex solto: XML usa um parser XML real (`fast-xml-parser`,
 * sem dependências, processamento 100% local); SGML usa uma máquina de
 * estados de pilha (tokenizer estrutural) definida abaixo.
 *
 * Datas: extraídas por fatiamento de string do prefixo `YYYYMMDD` de
 * `DTPOSTED`/`DTSTART`/`DTEND` — nunca via `new Date(...)`, para que um
 * sufixo de fuso (`[-3:BRT]`) nunca desloque o dia bancário.
 */

export interface OfxTransaction {
  fitid?: string;
  date: string; // YYYY-MM-DD
  amountCents: number; // convenção canônica: negativo = saída, positivo = entrada (OFX já usa TRNAMT assinado)
  type?: string;
  name?: string;
  memo?: string;
}

export interface OfxParseResult {
  transactions: OfxTransaction[];
  statementStart: string | null;
  statementEnd: string | null;
}

/** Extrai `YYYY-MM-DD` do prefixo numérico de um DTPOSTED/DTSTART/DTEND OFX. */
export function extractOfxDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = raw.trim().match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return undefined;
  const [, y, m, d] = match;
  return `${y}-${m}-${d}`;
}

/** Converte TRNAMT (sempre com ponto decimal no padrão OFX) para centavos. */
export function parseOfxAmountToCents(raw: string | undefined): number {
  if (raw === undefined) throw new Error('TRNAMT ausente');
  const value = Number(raw.trim());
  if (!Number.isFinite(value)) throw new Error(`TRNAMT inválido: "${raw}"`);
  return Math.round(value * 100);
}

/** OFX 2.x sempre declara `<?xml ... ?>` no início do arquivo; OFX 1.x (SGML) nunca. */
function isXmlOfx(text: string): boolean {
  return /^\s*<\?xml/i.test(text);
}

/**
 * OFX distingue estruturalmente extrato de conta (`BANKMSGSRSV1`/
 * `BANKACCTFROM`) de fatura de cartão (`CREDITCARDMSGSRSV1`/
 * `CCACCTFROM`) — usado para resolver a origem interna automaticamente
 * (seção 6 do pedido), sem perguntar ao usuário. Checagem estrutural
 * (presença da tag), nunca o nome do arquivo.
 */
export function detectOfxAccountKind(text: string): 'card' | 'account' {
  return /creditcardmsgsrsv1|ccacctfrom/i.test(text) ? 'card' : 'account';
}

// ---------------------------------------------------------------------------
// SGML (OFX 1.x): tags de container abrem e fecham explicitamente
// (`<STMTTRN>` ... `</STMTTRN>`); tags-folha trazem o valor na mesma linha e
// fecham implicitamente na próxima linha do mesmo nível (nunca são
// empilhadas). Isso é o formato real usado pelos bancos, não uma suposição.
// ---------------------------------------------------------------------------
interface SgmlNode {
  tag: string;
  value: string | null;
  children: SgmlNode[];
}

function parseSgml(body: string): SgmlNode {
  const root: SgmlNode = { tag: '#root', value: null, children: [] };
  const stack: SgmlNode[] = [root];
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const closeTagRe = /^<\/([A-Za-z0-9._]+)>$/;
  const openTagRe = /^<([A-Za-z0-9._]+)>(.*)$/;

  for (const line of lines) {
    const closeMatch = line.match(closeTagRe);
    if (closeMatch) {
      const tagName = closeMatch[1].toUpperCase();
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i].tag === tagName) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const openMatch = line.match(openTagRe);
    if (!openMatch) continue;
    const tagName = openMatch[1].toUpperCase();
    const rest = openMatch[2];
    if (rest.length === 0) {
      const node: SgmlNode = { tag: tagName, value: null, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else {
      const node: SgmlNode = { tag: tagName, value: rest, children: [] };
      stack[stack.length - 1].children.push(node);
    }
  }
  return root;
}

function findAllNodes(node: SgmlNode, tag: string): SgmlNode[] {
  const found: SgmlNode[] = [];
  for (const child of node.children) {
    if (child.tag === tag) found.push(child);
    found.push(...findAllNodes(child, tag));
  }
  return found;
}

function findFirstNode(node: SgmlNode, tag: string): SgmlNode | undefined {
  for (const child of node.children) {
    if (child.tag === tag) return child;
    const nested = findFirstNode(child, tag);
    if (nested) return nested;
  }
  return undefined;
}

function leafValue(node: SgmlNode, tag: string): string | undefined {
  const found = findFirstNode(node, tag);
  return found?.value ?? undefined;
}

function parseSgmlOfx(text: string): OfxParseResult {
  // O cabeçalho SGML (OFXHEADER:100 etc.) vem antes do primeiro `<`.
  const firstTagIndex = text.indexOf('<');
  const body = firstTagIndex >= 0 ? text.slice(firstTagIndex) : text;
  const tree = parseSgml(body);

  const transactionNodes = findAllNodes(tree, 'STMTTRN');
  const transactions: OfxTransaction[] = transactionNodes.map((node) => {
    const date = extractOfxDate(leafValue(node, 'DTPOSTED'));
    const amountCents = parseOfxAmountToCents(leafValue(node, 'TRNAMT'));
    if (!date) throw new Error('STMTTRN sem DTPOSTED válido');
    return {
      fitid: leafValue(node, 'FITID'),
      date,
      amountCents,
      type: leafValue(node, 'TRNTYPE'),
      name: leafValue(node, 'NAME'),
      memo: leafValue(node, 'MEMO'),
    };
  });

  return {
    transactions,
    statementStart: extractOfxDate(leafValue(tree, 'DTSTART')) ?? null,
    statementEnd: extractOfxDate(leafValue(tree, 'DTEND')) ?? null,
  };
}

// ---------------------------------------------------------------------------
// XML (OFX 2.x)
// ---------------------------------------------------------------------------
function deepFindAll(value: unknown, key: string): unknown[] {
  const found: unknown[] = [];
  if (value === null || typeof value !== 'object') return found;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === key) {
      if (Array.isArray(v)) found.push(...v);
      else found.push(v);
    } else {
      found.push(...deepFindAll(v, key));
    }
  }
  return found;
}

function deepFindFirst(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === key) return Array.isArray(v) ? v[0] : v;
    const nested = deepFindFirst(v, key);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function parseXmlOfx(text: string): OfxParseResult {
  const parser = new XMLParser({ ignoreAttributes: true, trimValues: true });
  const parsed: unknown = parser.parse(text);

  const transactionNodes = deepFindAll(parsed, 'STMTTRN') as Record<string, unknown>[];
  const transactions: OfxTransaction[] = transactionNodes.map((node) => {
    const date = extractOfxDate(asString(node.DTPOSTED));
    const amountCents = parseOfxAmountToCents(asString(node.TRNAMT));
    if (!date) throw new Error('STMTTRN sem DTPOSTED válido');
    return {
      fitid: asString(node.FITID),
      date,
      amountCents,
      type: asString(node.TRNTYPE),
      name: asString(node.NAME),
      memo: asString(node.MEMO),
    };
  });

  return {
    transactions,
    statementStart: extractOfxDate(asString(deepFindFirst(parsed, 'DTSTART'))) ?? null,
    statementEnd: extractOfxDate(asString(deepFindFirst(parsed, 'DTEND'))) ?? null,
  };
}

/**
 * `DTSTART`/`DTEND` do arquivo são a fonte preferida do intervalo (vêm do
 * próprio banco); quando ausentes, cai para a menor/maior data das
 * transações (nunca depende de estarem em ordem crescente/decrescente —
 * seção 9 do pedido).
 */
function withStatementRangeFallback(result: OfxParseResult): OfxParseResult {
  if (result.statementStart && result.statementEnd) return result;
  const { start, end } = computeDateRange(result.transactions.map((t) => t.date));
  return {
    transactions: result.transactions,
    statementStart: result.statementStart ?? start,
    statementEnd: result.statementEnd ?? end,
  };
}

export function parseOfx(text: string): OfxParseResult {
  const result = isXmlOfx(text) ? parseXmlOfx(text) : parseSgmlOfx(text);
  return withStatementRangeFallback(result);
}

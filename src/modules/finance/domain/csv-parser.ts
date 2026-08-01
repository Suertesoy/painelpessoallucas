/**
 * Parser CSV manual (sem dependência) para extratos/faturas.
 *
 * Cobre: separador por vírgula/ponto e vírgula/tab, campos entre aspas
 * (`""` como aspas literal), vírgula decimal brasileira, valores negativos,
 * datas brasileiras e ISO, colunas separadas de crédito/débito, cabeçalhos
 * variados, UTF-8 e Windows-1252.
 *
 * Convenção de saída: `amountCents` sempre segue a convenção canônica do
 * projeto (negativo = saída, positivo = entrada) — a normalização de sinal
 * de origem (ex.: fatura de cartão onde compra aparece como número
 * positivo) acontece aqui, a partir do `amountMode` escolhido no
 * mapeamento, nunca depois.
 */

export type CsvDelimiter = ',' | ';' | '\t';

export interface CsvDecodeResult {
  text: string;
  encoding: 'utf-8' | 'windows-1252';
}

/**
 * Decodifica um buffer de arquivo CSV. Tenta UTF-8 estrito primeiro (detecta
 * BOM ou decodificação válida); se falhar, assume Windows-1252 (comum em
 * exportações de banco/cartão brasileiras mais antigas). Nunca confia só na
 * extensão do arquivo.
 */
export function decodeTextBuffer(buffer: ArrayBuffer): CsvDecodeResult {
  return decodeCsvBuffer(buffer);
}

export function decodeCsvBuffer(buffer: ArrayBuffer): CsvDecodeResult {
  const bytes = new Uint8Array(buffer);
  const hasUtf8Bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    const text = utf8Decoder.decode(hasUtf8Bom ? bytes.subarray(3) : bytes);
    return { text, encoding: 'utf-8' };
  } catch {
    const windows1252Decoder = new TextDecoder('windows-1252');
    return { text: windows1252Decoder.decode(bytes), encoding: 'windows-1252' };
  }
}

/** Detecta o delimitador mais provável contando ocorrências na linha de cabeçalho. */
export function detectDelimiter(headerLine: string): CsvDelimiter {
  const candidates: CsvDelimiter[] = [',', ';', '\t'];
  let best: CsvDelimiter = ',';
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = headerLine.split(candidate).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

/**
 * Tokeniza texto CSV em linhas de campos, respeitando aspas (incluindo
 * delimitador/quebra de linha dentro de campo entre aspas e `""` como aspas
 * literal). Não é um split ingênuo por vírgula.
 */
export function tokenizeCsv(text: string, delimiter: CsvDelimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < normalized.length) {
    const char = normalized[i];
    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === delimiter) {
      endField();
      i += 1;
      continue;
    }
    if (char === '\n') {
      endRow();
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) endRow();

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

/**
 * Converte um número em formato brasileiro ou ISO para centavos inteiros.
 * "1.234,56" (BR) -> 123456; "-45,90" -> -4590; "1234.56" (ISO) -> 123456;
 * parênteses indicam negativo: "(45,90)" -> -4590.
 */
export function parseAmountToCents(raw: string): number {
  let value = raw.trim();
  if (value === '') throw new Error('Valor vazio');

  let negative = false;
  if (value.startsWith('(') && value.endsWith(')')) {
    negative = true;
    value = value.slice(1, -1);
  }
  value = value.replace(/^R\$\s*/i, '').trim();
  if (value.startsWith('-')) {
    negative = true;
    value = value.slice(1);
  } else if (value.startsWith('+')) {
    value = value.slice(1);
  }

  const hasComma = value.includes(',');
  const hasDot = value.includes('.');
  let normalized: string;
  if (hasComma && hasDot) {
    // BR: ponto é separador de milhar, vírgula é decimal.
    normalized = value.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    normalized = value.replace(',', '.');
  } else if (hasDot) {
    // Só ponto: decide se é decimal (últimos 2 dígitos) ou milhar.
    const parts = value.split('.');
    const lastGroup = parts[parts.length - 1];
    if (parts.length > 1 && lastGroup.length === 2) {
      normalized = value;
    } else {
      normalized = value.replace(/\./g, '');
    }
  } else {
    normalized = value;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`Valor numérico inválido: "${raw}"`);
  const cents = Math.round(parsed * 100);
  return negative ? -cents : cents;
}

/**
 * Converte uma data em formato brasileiro (`dd/mm/aaaa`) ou ISO
 * (`aaaa-mm-dd`) para `YYYY-MM-DD`, por fatiamento/regex de string — nunca
 * via `new Date(...)`, para não deslocar o dia por interpretação UTC.
 */
export function parseFlexibleDate(raw: string): string {
  const value = raw.trim();
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m}-${d}`;
  }
  const brMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (brMatch) {
    const [, d, m, yRaw] = brMatch;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  throw new Error(`Data em formato não reconhecido: "${raw}"`);
}

const HEADER_SYNONYMS: Record<'date' | 'description' | 'amount' | 'debit' | 'credit' | 'id', string[]> = {
  date: ['data', 'date', 'dt'],
  description: ['descricao', 'description', 'historico', 'histórico', 'lancamento', 'lançamento', 'title', 'memo'],
  amount: ['valor', 'amount', 'value', 'montante'],
  debit: ['debito', 'débito', 'debit', 'saida', 'saída'],
  credit: ['credito', 'crédito', 'credit', 'entrada'],
  id: ['id', 'identificador', 'fitid', 'codigo', 'código'],
};

function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

export type CsvAmountMode = 'signed' | 'card_positive_purchase';

export interface CsvColumnMapping {
  dateColumn: string;
  descriptionColumn: string;
  amountColumn?: string;
  amountMode?: CsvAmountMode;
  debitColumn?: string;
  creditColumn?: string;
  idColumn?: string;
}

export interface CsvDetectionResult {
  delimiter: CsvDelimiter;
  headers: string[];
  sampleRows: string[][];
  suggestedMapping: Partial<CsvColumnMapping>;
  confident: boolean;
}

/**
 * Analisa o texto CSV e tenta reconhecer automaticamente as colunas. Quando
 * a confiança é baixa (falta data, descrição, ou nenhuma forma de valor),
 * `confident` fica falso — o chamador deve pedir mapeamento manual antes de
 * processar qualquer linha.
 */
export function detectCsv(text: string): CsvDetectionResult {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = detectDelimiter(firstLine);
  const rows = tokenizeCsv(text, delimiter);
  if (rows.length === 0) {
    return { delimiter, headers: [], sampleRows: [], suggestedMapping: {}, confident: false };
  }
  const headers = rows[0];
  const sampleRows = rows.slice(1, 6);

  const findColumn = (keys: string[]): string | undefined => {
    for (const header of headers) {
      const normalized = normalizeHeader(header);
      if (keys.some((k) => normalized === k || normalized.includes(k))) return header;
    }
    return undefined;
  };

  const dateColumn = findColumn(HEADER_SYNONYMS.date);
  const descriptionColumn = findColumn(HEADER_SYNONYMS.description);
  const amountColumn = findColumn(HEADER_SYNONYMS.amount);
  const debitColumn = findColumn(HEADER_SYNONYMS.debit);
  const creditColumn = findColumn(HEADER_SYNONYMS.credit);
  const idColumn = findColumn(HEADER_SYNONYMS.id);

  const suggestedMapping: Partial<CsvColumnMapping> = {
    dateColumn,
    descriptionColumn,
    amountColumn,
    debitColumn,
    creditColumn,
    idColumn,
  };

  const hasAmountSignal = Boolean(amountColumn) || Boolean(debitColumn || creditColumn);
  const confident = Boolean(dateColumn && descriptionColumn && hasAmountSignal);

  return { delimiter, headers, sampleRows, suggestedMapping, confident };
}

export interface CsvParsedRow {
  rowIndex: number;
  date: string;
  description: string;
  originalDescription: string;
  amountCents: number;
  externalId?: string;
}

/**
 * Processa o CSV completo usando um mapeamento de colunas já resolvido
 * (automático com confiança ou escolhido manualmente pelo usuário).
 */
export function parseCsv(text: string, delimiter: CsvDelimiter, mapping: CsvColumnMapping): CsvParsedRow[] {
  const rows = tokenizeCsv(text, delimiter);
  if (rows.length === 0) return [];
  const headers = rows[0];
  const columnIndex = (name: string | undefined): number => (name ? headers.indexOf(name) : -1);

  const dateIdx = columnIndex(mapping.dateColumn);
  const descIdx = columnIndex(mapping.descriptionColumn);
  const amountIdx = columnIndex(mapping.amountColumn);
  const debitIdx = columnIndex(mapping.debitColumn);
  const creditIdx = columnIndex(mapping.creditColumn);
  const idIdx = columnIndex(mapping.idColumn);

  if (dateIdx === -1 || descIdx === -1) {
    throw new Error('Mapeamento de colunas incompleto: data e descrição são obrigatórias');
  }

  const parsed: CsvParsedRow[] = [];
  for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex++) {
    const cells = rows[rowIndex + 1];
    const rawDate = cells[dateIdx]?.trim() ?? '';
    const rawDescription = cells[descIdx]?.trim() ?? '';
    if (!rawDate && !rawDescription) continue;

    let amountCents: number;
    if (debitIdx !== -1 || creditIdx !== -1) {
      const debitRaw = debitIdx !== -1 ? cells[debitIdx]?.trim() : '';
      const creditRaw = creditIdx !== -1 ? cells[creditIdx]?.trim() : '';
      const debitCents = debitRaw ? Math.abs(parseAmountToCents(debitRaw)) : 0;
      const creditCents = creditRaw ? Math.abs(parseAmountToCents(creditRaw)) : 0;
      amountCents = creditCents - debitCents;
    } else if (amountIdx !== -1) {
      const rawAmount = cells[amountIdx]?.trim() ?? '';
      const parsedAmount = parseAmountToCents(rawAmount);
      amountCents = mapping.amountMode === 'card_positive_purchase' ? -parsedAmount : parsedAmount;
    } else {
      throw new Error('Mapeamento de colunas não define nenhuma coluna de valor');
    }

    parsed.push({
      rowIndex,
      date: parseFlexibleDate(rawDate),
      description: rawDescription,
      originalDescription: rawDescription,
      amountCents,
      externalId: idIdx !== -1 ? cells[idIdx]?.trim() || undefined : undefined,
    });
  }
  return parsed;
}

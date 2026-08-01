import { NextResponse } from 'next/server';
import { getSessionContext } from '@/platform/supabase/session';
import { ensureFinanceDefaults } from '@/modules/finance/infrastructure/ensure-finance-defaults';
import { resolveImportSource } from '@/modules/finance/infrastructure/resolve-import-source';
import { decodeTextBuffer, detectCsv, parseCsv, type CsvColumnMapping } from '@/modules/finance/domain/csv-parser';
import { parseOfx, detectOfxAccountKind } from '@/modules/finance/domain/ofx-parser';
import { normalizeText } from '@/modules/finance/domain/normalize-text';
import { buildRowFingerprint } from '@/modules/finance/domain/fingerprint';
import { computeDateRange } from '@/modules/finance/domain/date-range';
import { buildSafeImportName, type ImportKind } from '@/modules/finance/domain/import-naming';
import { importSourceProfileForCsv, importSourceProfileForOfx } from '@/modules/finance/domain/source-resolution';
import { classifyTransaction, defaultNatureForAmount, type LearnedClassificationRule } from '@/modules/finance/domain/classification-engine';
import { FALLBACK_FINANCE_CATEGORY_SLUG } from '@/modules/finance/domain/finance-category.schema';
import type { FinanceNature } from '@/modules/finance/domain/finance-transaction.schema';

/**
 * Recebe um extrato/fatura (CSV ou OFX), valida sessão + workspace, detecta o
 * formato/perfil automaticamente (nunca pergunta origem ao usuário — seção 4
 * do pedido), calcula SHA-256, classifica localmente e cria uma importação
 * em revisão.
 *
 * O arquivo bruto existe só durante esta requisição (buffer em memória) —
 * nunca é gravado em disco, Supabase, evento ou log; o NOME original também
 * nunca é persistido (pode carregar identificador de conta — seção 11 do
 * pedido) — só um nome seguro derivado do perfil detectado e do intervalo de
 * datas. Nenhum dado é enviado a serviços externos (parsing 100% local).
 */

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

type ErrorCategory =
  | 'unauthenticated'
  | 'invalid_request'
  | 'file_too_large'
  | 'invalid_format'
  | 'duplicate_import'
  | 'server_error';

function errorResponse(status: number, errorCategory: ErrorCategory, message: string) {
  return NextResponse.json({ error: message, errorCategory }, { status });
}

interface ParsedRow {
  date: string;
  description: string;
  originalDescription: string;
  amountCents: number;
  sourceAmountCents: number;
  fitid?: string;
}

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return errorResponse(401, 'unauthenticated', 'Sessão expirada. Faça login novamente.');

  // Fail-fast pelo cabeçalho antes de ler o corpo inteiro; o tamanho real do
  // arquivo é conferido de novo abaixo (o header pode estar ausente/errado).
  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader && Number(contentLengthHeader) > MAX_FILE_BYTES) {
    return errorResponse(413, 'file_too_large', 'Arquivo maior que o limite de 10 MB.');
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(400, 'invalid_request', 'Corpo da requisição inválido.');
  }

  const file = formData.get('file');
  const mappingRaw = formData.get('mapping');

  if (!(file instanceof File)) return errorResponse(400, 'invalid_request', 'Arquivo ausente.');
  if (file.size === 0) return errorResponse(400, 'invalid_request', 'O arquivo está vazio.');
  if (file.size > MAX_FILE_BYTES) return errorResponse(413, 'file_too_large', 'Arquivo maior que o limite de 10 MB.');

  const fileName = file.name || 'arquivo';
  const extension = fileName.toLowerCase().split('.').pop();
  const isCsv = extension === 'csv';
  const isOfx = extension === 'ofx';
  if (!isCsv && !isOfx) {
    return errorResponse(415, 'invalid_format', 'Formato não reconhecido. Envie um arquivo .csv ou .ofx.');
  }

  const buffer = await file.arrayBuffer();

  // SHA-256 no servidor, antes de qualquer persistência — o buffer some da
  // memória ao final desta função; nunca é salvo.
  const digestBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const fileSha256 = Array.from(new Uint8Array(digestBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  let parsedRows: ParsedRow[];
  let importKind: ImportKind;
  let sourceProfile: ReturnType<typeof importSourceProfileForCsv>;

  if (isCsv) {
    const decoded = decodeTextBuffer(buffer);
    let mapping: CsvColumnMapping | undefined;
    if (typeof mappingRaw === 'string' && mappingRaw.length > 0) {
      try {
        mapping = JSON.parse(mappingRaw) as CsvColumnMapping;
      } catch {
        return errorResponse(400, 'invalid_request', 'Mapeamento de colunas inválido.');
      }
    }

    const detection = detectCsv(decoded.text);
    if (detection.headers.length === 0) {
      return errorResponse(400, 'invalid_format', 'Não foi possível interpretar o arquivo como CSV.');
    }

    const hasSingleAmountColumn =
      Boolean(detection.suggestedMapping.amountColumn) &&
      !detection.suggestedMapping.debitColumn &&
      !detection.suggestedMapping.creditColumn;
    // Os dois perfis Nubank reconhecidos (seção 3 do pedido) já têm o modo
    // de sinal resolvido deterministicamente pelo próprio perfil — nunca
    // pedem mapeamento manual, mesmo com uma única coluna de valor. Fora
    // deles, a convenção de sinal só é segura com colunas separadas de
    // débito/crédito; com uma única coluna, sempre pede confirmação
    // explícita do usuário (nunca adivinha se compra é positiva ou negativa).
    const isKnownProfile = detection.profile !== 'generic';
    const needsMapping = !mapping && !isKnownProfile && (!detection.confident || hasSingleAmountColumn);
    if (needsMapping) {
      return NextResponse.json({ needsMapping: true, detection });
    }

    const resolvedMapping = mapping ?? (detection.suggestedMapping as CsvColumnMapping);
    let csvRows;
    try {
      csvRows = parseCsv(decoded.text, detection.delimiter, resolvedMapping);
    } catch {
      return errorResponse(400, 'invalid_format', 'Não foi possível interpretar o CSV com o mapeamento informado.');
    }
    parsedRows = csvRows.map((r) => ({
      date: r.date,
      description: r.description,
      originalDescription: r.originalDescription,
      amountCents: r.amountCents,
      sourceAmountCents: r.sourceAmountCents,
      fitid: r.externalId,
    }));
    importKind = detection.profile;
    sourceProfile = importSourceProfileForCsv(detection.profile, resolvedMapping.amountMode);
  } else {
    const decoded = decodeTextBuffer(buffer);
    if (!/<ofx/i.test(decoded.text)) {
      return errorResponse(400, 'invalid_format', 'Arquivo não parece ser um OFX válido.');
    }
    try {
      const ofxResult = parseOfx(decoded.text);
      parsedRows = ofxResult.transactions.map((t) => ({
        date: t.date,
        description: t.name ?? t.memo ?? 'Lançamento sem descrição',
        originalDescription: t.name ?? t.memo ?? 'Lançamento sem descrição',
        amountCents: t.amountCents,
        sourceAmountCents: t.amountCents,
        fitid: t.fitid,
      }));
    } catch {
      return errorResponse(400, 'invalid_format', 'Não foi possível interpretar o arquivo OFX.');
    }
    importKind = 'ofx';
    sourceProfile = importSourceProfileForOfx(detectOfxAccountKind(decoded.text));
  }

  if (parsedRows.length === 0) {
    return errorResponse(400, 'invalid_format', 'Nenhum lançamento foi encontrado no arquivo.');
  }

  const { start: statementStart, end: statementEnd } = computeDateRange(parsedRows.map((r) => r.date));

  // Garante categorias/origens (ensureFinanceDefaults é idempotente) antes
  // de classificar — cobre o primeiro import de um workspace novo.
  await ensureFinanceDefaults(session.supabase, session.workspaceId);

  // Origem resolvida automaticamente pelo perfil detectado — o usuário nunca
  // escolhe origem (seção 6 do pedido).
  const resolvedSource = await resolveImportSource(session.supabase, session.workspaceId, sourceProfile);
  const sourceId = resolvedSource.id;

  // Reimportação idempotente: mesmo hash na mesma origem/workspace nunca
  // cria uma segunda revisão pendente nem uma segunda confirmação.
  const { data: existingImport, error: existingImportError } = await session.supabase
    .from('finance_imports')
    .select('*')
    .eq('workspace_id', session.workspaceId)
    .eq('source_id', sourceId)
    .eq('file_sha256', fileSha256)
    .maybeSingle();
  if (existingImportError) return errorResponse(500, 'server_error', 'Não foi possível verificar duplicidade do arquivo.');
  if (existingImport) {
    if (existingImport.status === 'confirmed') {
      return errorResponse(409, 'duplicate_import', 'Este arquivo já foi importado e confirmado para esta origem.');
    }
    return NextResponse.json({
      importId: existingImport.id,
      reopened: true,
      rowCount: existingImport.row_count,
      profile: importKind,
      sourceName: resolvedSource.name,
      statementStart: existingImport.statement_start,
      statementEnd: existingImport.statement_end,
    });
  }

  const [{ data: categoryRows }, { data: ruleRows }] = await Promise.all([
    session.supabase.from('finance_categories').select('id, slug').eq('workspace_id', session.workspaceId),
    session.supabase.from('finance_classification_rules').select('*').eq('workspace_id', session.workspaceId),
  ]);
  const categoryIdBySlug = new Map((categoryRows ?? []).map((c) => [c.slug as string, c.id as string]));
  const categorySlugById = new Map((categoryRows ?? []).map((c) => [c.id as string, c.slug as string]));
  const fallbackCategoryId = categoryIdBySlug.get(FALLBACK_FINANCE_CATEGORY_SLUG);
  if (!fallbackCategoryId) {
    return errorResponse(500, 'server_error', 'Categorias financeiras não inicializadas para este workspace.');
  }

  const learnedRules: LearnedClassificationRule[] = (ruleRows ?? [])
    .map((r) => {
      const slug = categorySlugById.get(r.category_id as string);
      if (!slug) return null;
      return {
        matchType: r.match_type as 'exact' | 'contains',
        matchText: r.match_text as string,
        categorySlug: slug,
        nature: (r.nature as FinanceNature | null) ?? null,
      };
    })
    .filter((r): r is LearnedClassificationRule => r !== null);

  // Sinais de possível duplicidade: por FITID contra transações já
  // confirmadas na mesma origem, e por impressão digital (dentro do lote e
  // contra transações confirmadas) para linhas sem FITID.
  const fitids = parsedRows.map((r) => r.fitid).filter((v): v is string => Boolean(v));
  const { data: matchingFitidTransactions } =
    fitids.length > 0
      ? await session.supabase
          .from('finance_transactions')
          .select('id, fitid')
          .eq('workspace_id', session.workspaceId)
          .eq('source_id', sourceId)
          .in('fitid', fitids)
      : { data: [] as { id: string; fitid: string }[] };
  const transactionIdByFitid = new Map((matchingFitidTransactions ?? []).map((t) => [t.fitid, t.id]));

  const fingerprintToRowId = new Map<string, string>();
  const rowsToInsert: Record<string, unknown>[] = [];
  const candidateFingerprints: string[] = [];

  const preparedRows = parsedRows.map((row) => {
    const normalizedDescription = normalizeText(row.description);
    const suggestion = classifyTransaction(normalizedDescription, learnedRules);
    const suggestedCategoryId = categoryIdBySlug.get(suggestion.categorySlug) ?? fallbackCategoryId;
    const suggestedNature: FinanceNature = suggestion.nature ?? defaultNatureForAmount(row.amountCents);
    const fingerprint = row.fitid
      ? null
      : buildRowFingerprint({ sourceId, date: row.date, amountCents: row.amountCents, normalizedDescription });
    if (fingerprint) candidateFingerprints.push(fingerprint);
    return { row, suggestedCategoryId, suggestedNature, reason: suggestion.reason, fingerprint };
  });

  const { data: matchingFingerprintTransactions } =
    candidateFingerprints.length > 0
      ? await session.supabase
          .from('finance_transactions')
          .select('id, fingerprint')
          .eq('workspace_id', session.workspaceId)
          .in('fingerprint', candidateFingerprints)
      : { data: [] as { id: string; fingerprint: string }[] };
  const transactionIdByFingerprint = new Map((matchingFingerprintTransactions ?? []).map((t) => [t.fingerprint, t.id]));

  for (const [index, prepared] of preparedRows.entries()) {
    const rowId = crypto.randomUUID();
    const { row, suggestedCategoryId, suggestedNature, reason, fingerprint } = prepared;

    let possibleDuplicateTransactionId: string | null = null;
    let possibleDuplicateImportRowId: string | null = null;
    if (row.fitid) {
      possibleDuplicateTransactionId = transactionIdByFitid.get(row.fitid) ?? null;
    } else if (fingerprint) {
      const seenRowId = fingerprintToRowId.get(fingerprint);
      if (seenRowId) {
        possibleDuplicateImportRowId = seenRowId;
      } else {
        possibleDuplicateTransactionId = transactionIdByFingerprint.get(fingerprint) ?? null;
      }
      fingerprintToRowId.set(fingerprint, rowId);
    }

    rowsToInsert.push({
      id: rowId,
      workspace_id: session.workspaceId,
      import_id: null, // preenchido após inserir o import
      row_index: index,
      transaction_date: row.date,
      description: row.description,
      original_description: row.originalDescription,
      amount_cents: row.amountCents,
      source_amount_cents: row.sourceAmountCents,
      fitid: row.fitid ?? null,
      fingerprint,
      category_id: suggestedCategoryId,
      nature: suggestedNature,
      suggested_category_id: suggestedCategoryId,
      suggested_nature: suggestedNature,
      classification_reason: reason,
      possible_duplicate_transaction_id: possibleDuplicateTransactionId,
      possible_duplicate_import_row_id: possibleDuplicateImportRowId,
      status: 'pending_review',
    });
  }

  // Nome seguro derivado do perfil + intervalo de datas — o nome ORIGINAL do
  // arquivo (pode carregar identificador de conta) nunca é persistido.
  const safeFileName = buildSafeImportName(importKind, resolvedSource.kind, statementStart, statementEnd);

  const { data: insertedImport, error: insertImportError } = await session.supabase
    .from('finance_imports')
    .insert({
      workspace_id: session.workspaceId,
      source_id: sourceId,
      file_name: safeFileName,
      file_sha256: fileSha256,
      format: isCsv ? 'csv' : 'ofx',
      row_count: parsedRows.length,
      statement_start: statementStart,
      statement_end: statementEnd,
    })
    .select()
    .single();

  if (insertImportError) {
    // Corrida: duas requisições simultâneas para o mesmo arquivo colidem no
    // índice único — a perdedora busca e devolve o resultado da vencedora.
    if (insertImportError.code === '23505') {
      const { data: raceImport } = await session.supabase
        .from('finance_imports')
        .select('*')
        .eq('workspace_id', session.workspaceId)
        .eq('source_id', sourceId)
        .eq('file_sha256', fileSha256)
        .maybeSingle();
      if (raceImport) {
        if (raceImport.status === 'confirmed') {
          return errorResponse(409, 'duplicate_import', 'Este arquivo já foi importado e confirmado para esta origem.');
        }
        return NextResponse.json({
          importId: raceImport.id,
          reopened: true,
          rowCount: raceImport.row_count,
          profile: importKind,
          sourceName: resolvedSource.name,
          statementStart: raceImport.statement_start,
          statementEnd: raceImport.statement_end,
        });
      }
    }
    return errorResponse(500, 'server_error', 'Não foi possível criar a importação.');
  }

  const importId = insertedImport.id as string;
  const finalRows = rowsToInsert.map((r) => ({ ...r, import_id: importId }));

  const { error: insertRowsError } = await session.supabase.from('finance_import_rows').insert(finalRows);
  if (insertRowsError) {
    return errorResponse(500, 'server_error', 'Não foi possível salvar as linhas da importação.');
  }

  return NextResponse.json({
    importId,
    reopened: false,
    rowCount: parsedRows.length,
    profile: importKind,
    sourceName: resolvedSource.name,
    statementStart,
    statementEnd,
  });
}

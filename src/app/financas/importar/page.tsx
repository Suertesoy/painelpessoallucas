'use client';

import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Upload, X, FileText, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

/**
 * Importação em lote (seções 2 e 7 do pedido): o usuário seleciona/arrasta
 * vários CSV/OFX de uma vez, o formato de cada um é detectado
 * automaticamente (nunca pergunta origem/pessoa antes do upload), e cada
 * arquivo tem progresso e resultado independentes — um arquivo inválido ou
 * duplicado nunca bloqueia os demais. Reaproveita a rota individual
 * existente com concorrência limitada, em vez de uma rota multipart de lote.
 */

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB por arquivo
const MAX_BATCH_FILES = 10;
const MAX_BATCH_BYTES = 40 * 1024 * 1024; // 40 MB no lote inteiro
const CONCURRENCY = 2;

interface CsvDetectionResponse {
  delimiter: string;
  headers: string[];
  sampleRows: string[][];
  suggestedMapping: {
    dateColumn?: string;
    descriptionColumn?: string;
    amountColumn?: string;
    debitColumn?: string;
    creditColumn?: string;
    idColumn?: string;
  };
  confident: boolean;
  profile: string;
}

type FileStatus =
  | 'pending'
  | 'uploading'
  | 'recognized_card'
  | 'recognized_account'
  | 'processed'
  | 'duplicate'
  | 'needs_mapping'
  | 'invalid'
  | 'failed';

interface QueueItem {
  localId: string;
  file: File;
  status: FileStatus;
  message?: string;
  importId?: string;
  rowCount?: number;
  sourceName?: string;
  detection?: CsvDetectionResponse;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(item: QueueItem): { text: string; tone: 'neutral' | 'success' | 'warning' | 'error' } {
  switch (item.status) {
    case 'pending':
      return { text: 'Aguardando', tone: 'neutral' };
    case 'uploading':
      return { text: 'Processando…', tone: 'neutral' };
    case 'recognized_card':
      return { text: 'Reconhecido como fatura Nubank', tone: 'success' };
    case 'recognized_account':
      return { text: 'Reconhecido como extrato Nubank', tone: 'success' };
    case 'processed':
      return { text: 'Processado', tone: 'success' };
    case 'duplicate':
      return { text: 'Duplicado', tone: 'warning' };
    case 'needs_mapping':
      return { text: 'Formato precisa ser confirmado', tone: 'warning' };
    case 'invalid':
      return { text: 'Inválido', tone: 'error' };
    case 'failed':
      return { text: item.message ?? 'Falhou', tone: 'error' };
    default:
      return { text: item.status, tone: 'neutral' };
  }
}

const TONE_CLASSES: Record<string, string> = {
  neutral: 'bg-gray-50 text-gray-600',
  success: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-800',
  error: 'bg-red-50 text-red-700',
};

async function uploadFile(file: File, mapping?: Record<string, unknown>): Promise<Partial<QueueItem> & { needsMapping?: boolean; detection?: CsvDetectionResponse }> {
  const formData = new FormData();
  formData.set('file', file);
  if (mapping) formData.set('mapping', JSON.stringify(mapping));

  let response: Response;
  try {
    response = await fetch('/api/finance/import', { method: 'POST', body: formData });
  } catch {
    return { status: 'failed', message: 'Falha de conexão ao enviar o arquivo.' };
  }

  let body: Record<string, unknown>;
  try {
    body = await response.json();
  } catch {
    return { status: 'failed', message: 'Resposta inválida do servidor.' };
  }

  if (!response.ok) {
    if (body.errorCategory === 'duplicate_import') {
      return { status: 'duplicate', message: (body.error as string) ?? 'Este arquivo já foi importado.' };
    }
    return { status: 'invalid', message: (body.error as string) ?? 'Não foi possível processar o arquivo.' };
  }

  if (body.needsMapping) {
    return { status: 'needs_mapping', detection: body.detection as CsvDetectionResponse, needsMapping: true };
  }

  const profile = body.profile as string;
  const reopened = Boolean(body.reopened);
  const status: FileStatus = reopened
    ? 'duplicate'
    : profile === 'nubank_credit_card_statement'
      ? 'recognized_card'
      : profile === 'nubank_account_statement'
        ? 'recognized_account'
        : 'processed';

  return {
    status,
    importId: body.importId as string,
    rowCount: body.rowCount as number,
    sourceName: body.sourceName as string,
    message: reopened ? 'Revisão pendente já existente foi reaberta.' : undefined,
  };
}

const NONE = '__none__';

function FileMappingForm({ item, onSubmit }: { item: QueueItem; onSubmit: (mapping: Record<string, unknown>) => void }) {
  const detection = item.detection!;
  const [dateColumn, setDateColumn] = useState(detection.suggestedMapping.dateColumn ?? '');
  const [descriptionColumn, setDescriptionColumn] = useState(detection.suggestedMapping.descriptionColumn ?? '');
  const [valueMode, setValueMode] = useState<'single' | 'split'>(
    detection.suggestedMapping.debitColumn || detection.suggestedMapping.creditColumn ? 'split' : 'single'
  );
  const [amountColumn, setAmountColumn] = useState(detection.suggestedMapping.amountColumn ?? '');
  const [amountMode, setAmountMode] = useState<'signed' | 'card_positive_purchase'>('signed');
  const [debitColumn, setDebitColumn] = useState(detection.suggestedMapping.debitColumn ?? '');
  const [creditColumn, setCreditColumn] = useState(detection.suggestedMapping.creditColumn ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mapping =
      valueMode === 'split'
        ? { dateColumn, descriptionColumn, debitColumn: debitColumn || undefined, creditColumn: creditColumn || undefined }
        : { dateColumn, descriptionColumn, amountColumn, amountMode };
    onSubmit(mapping);
  };

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2 rounded border border-amber-200 bg-amber-50 p-2.5">
      <p className="text-xs text-amber-900">
        Não conseguimos determinar com segurança quais colunas representam data, descrição e valor em <strong>{item.file.name}</strong>.
        Confirme abaixo.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-xs text-gray-700">
          Coluna de data
          <select value={dateColumn} onChange={(e) => setDateColumn(e.target.value)} required className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-xs">
            <option value="">Selecione…</option>
            {detection.headers.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-700">
          Coluna de descrição
          <select value={descriptionColumn} onChange={(e) => setDescriptionColumn(e.target.value)} required className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-xs">
            <option value="">Selecione…</option>
            {detection.headers.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="text-xs">
        <legend className="font-medium text-gray-700">Como o valor aparece?</legend>
        <label className="mt-1 flex items-center gap-2">
          <input type="radio" checked={valueMode === 'single'} onChange={() => setValueMode('single')} /> Uma única coluna de valor
        </label>
        <label className="mt-1 flex items-center gap-2">
          <input type="radio" checked={valueMode === 'split'} onChange={() => setValueMode('split')} /> Colunas separadas de débito e crédito
        </label>
      </fieldset>

      {valueMode === 'single' ? (
        <>
          <label className="block text-xs text-gray-700">
            Coluna de valor
            <select value={amountColumn} onChange={(e) => setAmountColumn(e.target.value)} required className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-xs">
              <option value="">Selecione…</option>
              {detection.headers.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </label>
          <fieldset className="text-xs">
            <legend className="font-medium text-gray-700">Essa coluna representa</legend>
            <label className="mt-1 flex items-center gap-2">
              <input type="radio" checked={amountMode === 'signed'} onChange={() => setAmountMode('signed')} /> Valor com sinal (negativo = saída)
            </label>
            <label className="mt-1 flex items-center gap-2">
              <input type="radio" checked={amountMode === 'card_positive_purchase'} onChange={() => setAmountMode('card_positive_purchase')} /> Sempre positivo representando compra
            </label>
          </fieldset>
        </>
      ) : (
        <>
          <label className="block text-xs text-gray-700">
            Coluna de débito (saída)
            <select value={debitColumn} onChange={(e) => setDebitColumn(e.target.value === NONE ? '' : e.target.value)} className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-xs">
              <option value={NONE}>Nenhuma</option>
              {detection.headers.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-gray-700">
            Coluna de crédito (entrada)
            <select value={creditColumn} onChange={(e) => setCreditColumn(e.target.value === NONE ? '' : e.target.value)} className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-xs">
              <option value={NONE}>Nenhuma</option>
              {detection.headers.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </label>
        </>
      )}

      <button type="submit" disabled={!dateColumn || !descriptionColumn} className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        Continuar com este mapeamento
      </button>
    </form>
  );
}

export default function FinanceImportPage() {
  const router = useRouter();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const totalBytes = useMemo(() => items.reduce((sum, i) => sum + i.file.size, 0), [items]);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    setBatchError(null);
    setSummaryVisible(false);
    const list = Array.from(incoming);
    setItems((prev) => {
      const next = [...prev];
      for (const file of list) {
        if (next.length >= MAX_BATCH_FILES) {
          setBatchError(`Limite de ${MAX_BATCH_FILES} arquivos por lote atingido — os demais não foram adicionados.`);
          break;
        }
        const extension = file.name.toLowerCase().split('.').pop();
        const validExtension = extension === 'csv' || extension === 'ofx';
        const currentTotal = next.reduce((sum, i) => sum + i.file.size, 0);
        if (currentTotal + file.size > MAX_BATCH_BYTES) {
          setBatchError(`Limite de ${formatBytes(MAX_BATCH_BYTES)} por lote seria ultrapassado — "${file.name}" não foi adicionado.`);
          continue;
        }
        const localId = crypto.randomUUID();
        if (!validExtension) {
          next.push({ localId, file, status: 'invalid', message: 'Formato não aceito. Envie .csv ou .ofx.' });
        } else if (file.size > MAX_FILE_BYTES) {
          next.push({ localId, file, status: 'invalid', message: `Arquivo maior que o limite de ${formatBytes(MAX_FILE_BYTES)}.` });
        } else {
          next.push({ localId, file, status: 'pending' });
        }
      }
      return next;
    });
  }, []);

  const removeFile = (localId: string) => {
    setItems((prev) => prev.filter((i) => i.localId !== localId));
    setSummaryVisible(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  const updateItem = (localId: string, patch: Partial<QueueItem>) => {
    setItems((prev) => prev.map((i) => (i.localId === localId ? { ...i, ...patch } : i)));
  };

  const processOne = async (item: QueueItem) => {
    updateItem(item.localId, { status: 'uploading' });
    const result = await uploadFile(item.file);
    updateItem(item.localId, result as Partial<QueueItem>);
  };

  const handleProcessBatch = async () => {
    const pending = items.filter((i) => i.status === 'pending');
    if (pending.length === 0) return;
    setProcessing(true);
    setSummaryVisible(false);
    // Fila com concorrência limitada e previsível — nunca ilimitada.
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const item = pending[cursor];
        cursor += 1;
        await processOne(item);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, () => worker()));
    setProcessing(false);
    setSummaryVisible(true);
  };

  const handleMappingSubmit = async (item: QueueItem, mapping: Record<string, unknown>) => {
    updateItem(item.localId, { status: 'uploading' });
    const result = await uploadFile(item.file, mapping);
    updateItem(item.localId, result as Partial<QueueItem>);
    setSummaryVisible(true);
  };

  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const processedCount = items.filter((i) => i.status !== 'pending' && i.status !== 'uploading').length;

  const summary = useMemo(() => {
    const attempted = items.filter((i) => i.status !== 'pending' && i.status !== 'uploading');
    const recognizedAutomatically = attempted.filter((i) => i.status === 'recognized_card' || i.status === 'recognized_account').length;
    const alreadyImported = attempted.filter((i) => i.status === 'duplicate').length;
    const needsConfirmation = attempted.filter((i) => i.status === 'needs_mapping').length;
    const totalRows = attempted.reduce((sum, i) => sum + (i.rowCount ?? 0), 0);
    return { attempted: attempted.length, recognizedAutomatically, alreadyImported, needsConfirmation, totalRows, possibleDuplicates: alreadyImported };
  }, [items]);

  const reviewQueue = useMemo(
    () =>
      items
        .filter((i) => i.importId && (i.status === 'recognized_card' || i.status === 'recognized_account' || i.status === 'processed' || (i.status === 'duplicate' && i.message?.includes('reaberta'))))
        .map((i) => i.importId as string),
    [items]
  );

  const goToReview = () => {
    if (reviewQueue.length === 0) return;
    const query = reviewQueue.length > 1 ? `?queue=${reviewQueue.join(',')}&pos=0` : '';
    router.push(`/financas/revisao/${reviewQueue[0]}${query}`);
  };

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <Link href="/financas" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800">
        <ArrowLeft size={14} /> Voltar para Finanças
      </Link>
      <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold">
        <Upload size={22} className="text-blue-600" /> Importar extratos e faturas
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Selecione ou arraste vários arquivos CSV ou OFX juntos — o formato de cada um é reconhecido automaticamente. Até{' '}
        {MAX_BATCH_FILES} arquivos e {formatBytes(MAX_BATCH_BYTES)} por lote, {formatBytes(MAX_FILE_BYTES)} por arquivo. O
        arquivo bruto nunca é armazenado.
      </p>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="mt-4 rounded-lg border-2 border-dashed border-gray-300 bg-white p-6 text-center"
      >
        <p className="text-sm text-gray-600">Arraste os arquivos aqui ou</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Selecionar arquivos
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.ofx"
          multiple
          onChange={handleInputChange}
          className="hidden"
          aria-label="Selecionar arquivos CSV ou OFX"
        />
      </div>

      {batchError && (
        <p role="alert" className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {batchError}
        </p>
      )}

      {items.length > 0 && (
        <>
          <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
            <span>
              {items.length} arquivo(s) selecionado(s) · {formatBytes(totalBytes)} no total
            </span>
          </div>

          <ul className="mt-2 space-y-2">
            {items.map((item) => {
              const label = statusLabel(item);
              return (
                <li key={item.localId} className="rounded-lg border border-gray-200 bg-white p-2.5">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-800">{item.file.name}</p>
                      <p className="text-xs text-gray-400">{formatBytes(item.file.size)}</p>
                    </div>
                    {item.status === 'uploading' && <Loader2 size={14} className="animate-spin text-gray-400" />}
                    {(item.status === 'recognized_card' || item.status === 'recognized_account' || item.status === 'processed') && (
                      <CheckCircle2 size={14} className="text-green-600" />
                    )}
                    {(item.status === 'duplicate' || item.status === 'needs_mapping') && <AlertTriangle size={14} className="text-amber-600" />}
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_CLASSES[label.tone]}`}>{label.text}</span>
                    {item.status !== 'uploading' && (
                      <button
                        type="button"
                        onClick={() => removeFile(item.localId)}
                        aria-label={`Remover ${item.file.name}`}
                        className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  {item.message && item.status !== 'needs_mapping' && <p className="mt-1 text-xs text-gray-500">{item.message}</p>}
                  {item.status === 'needs_mapping' && item.detection && (
                    <FileMappingForm item={item} onSubmit={(mapping) => void handleMappingSubmit(item, mapping)} />
                  )}
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={() => void handleProcessBatch()}
            disabled={processing || pendingCount === 0}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {processing ? 'Processando…' : `Processar ${pendingCount || items.length} arquivo(s)`}
          </button>
        </>
      )}

      {summaryVisible && processedCount > 0 && (
        <section aria-label="Resumo do lote" className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h2 className="text-sm font-semibold text-blue-900">Resumo do lote</h2>
          <ul className="mt-2 space-y-1 text-xs text-blue-900">
            <li>{summary.attempted} arquivo(s) processado(s)</li>
            <li>{summary.recognizedAutomatically} reconhecido(s) automaticamente</li>
            <li>{summary.alreadyImported} já tinham sido importados</li>
            <li>{summary.needsConfirmation} precisam de confirmação de formato</li>
            <li>{summary.totalRows} lançamento(s) encontrado(s)</li>
            <li>{summary.possibleDuplicates} possível(is) duplicidade(s)</li>
          </ul>
          {reviewQueue.length > 0 && (
            <button
              type="button"
              onClick={goToReview}
              className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              Ir para revisão ({reviewQueue.length} pendente{reviewQueue.length > 1 ? 's' : ''})
            </button>
          )}
        </section>
      )}
    </div>
  );
}

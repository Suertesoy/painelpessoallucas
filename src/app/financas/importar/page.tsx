'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Upload } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useQueries } from '@/providers/repository.provider';

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
}

type UploadResult =
  | { kind: 'needsMapping'; detection: CsvDetectionResponse; sourceKind: 'card' | 'account' }
  | { kind: 'success'; importId: string; reopened: boolean }
  | { kind: 'error'; message: string };

const NONE = '__none__';

export default function FinanceImportPage() {
  const router = useRouter();
  const { finance: financeQueries } = useQueries();
  const { data: sources } = useReactiveQuery(() => financeQueries.queries.listSources(), []);

  const [sourceId, setSourceId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  // Estado do mapeamento manual (segundo envio, mesmo arquivo).
  const [dateColumn, setDateColumn] = useState('');
  const [descriptionColumn, setDescriptionColumn] = useState('');
  const [valueMode, setValueMode] = useState<'single' | 'split'>('single');
  const [amountColumn, setAmountColumn] = useState('');
  const [amountMode, setAmountMode] = useState<'signed' | 'card_positive_purchase'>('signed');
  const [debitColumn, setDebitColumn] = useState('');
  const [creditColumn, setCreditColumn] = useState('');

  async function upload(mapping?: Record<string, unknown>) {
    if (!file || !sourceId) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set('file', file);
      formData.set('sourceId', sourceId);
      if (mapping) formData.set('mapping', JSON.stringify(mapping));

      const response = await fetch('/api/finance/import', { method: 'POST', body: formData });
      const body = await response.json();

      if (!response.ok) {
        setResult({ kind: 'error', message: body.error ?? 'Não foi possível importar o arquivo.' });
        return;
      }
      if (body.needsMapping) {
        const detection = body.detection as CsvDetectionResponse;
        setDateColumn(detection.suggestedMapping.dateColumn ?? '');
        setDescriptionColumn(detection.suggestedMapping.descriptionColumn ?? '');
        setAmountColumn(detection.suggestedMapping.amountColumn ?? '');
        setDebitColumn(detection.suggestedMapping.debitColumn ?? '');
        setCreditColumn(detection.suggestedMapping.creditColumn ?? '');
        setValueMode(detection.suggestedMapping.debitColumn || detection.suggestedMapping.creditColumn ? 'split' : 'single');
        setResult({ kind: 'needsMapping', detection, sourceKind: body.sourceKind });
        return;
      }
      setResult({ kind: 'success', importId: body.importId, reopened: Boolean(body.reopened) });
      router.push(`/financas/revisao/${body.importId}`);
    } catch {
      setResult({ kind: 'error', message: 'Falha de conexão ao enviar o arquivo. Tente novamente.' });
    } finally {
      setSubmitting(false);
    }
  }

  const handleInitialSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setResult(null);
    await upload();
  };

  const handleMappingSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const mapping =
      valueMode === 'split'
        ? { dateColumn, descriptionColumn, debitColumn: debitColumn || undefined, creditColumn: creditColumn || undefined }
        : { dateColumn, descriptionColumn, amountColumn, amountMode };
    await upload(mapping);
  };

  const detection = result?.kind === 'needsMapping' ? result.detection : null;

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <Link href="/financas" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800">
        <ArrowLeft size={14} /> Voltar para Finanças
      </Link>
      <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold">
        <Upload size={22} className="text-blue-600" /> Importar extrato ou fatura
      </h1>
      <p className="mt-1 text-sm text-gray-500">Aceita arquivos CSV e OFX de até 10 MB. O arquivo bruto nunca é armazenado.</p>

      {!detection && (
        <form onSubmit={handleInitialSubmit} className="mt-6 space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <label className="block text-sm">
            Origem
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              required
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Selecione…</option>
              {(sources ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Arquivo (.csv ou .ofx)
            <input
              type="file"
              accept=".csv,.ofx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
              className="mt-1 block w-full text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={submitting || !file || !sourceId}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Enviando…' : 'Enviar'}
          </button>
        </form>
      )}

      {detection && (
        <form onSubmit={handleMappingSubmit} className="mt-6 space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-700">
            Não conseguimos determinar com segurança quais colunas representam data, descrição e valor. Confirme abaixo antes
            de continuar.
          </p>
          <label className="block text-sm">
            Coluna de data
            <select value={dateColumn} onChange={(e) => setDateColumn(e.target.value)} required className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
              <option value="">Selecione…</option>
              {detection.headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Coluna de descrição
            <select value={descriptionColumn} onChange={(e) => setDescriptionColumn(e.target.value)} required className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
              <option value="">Selecione…</option>
              {detection.headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="text-sm">
            <legend className="font-medium text-gray-700">Como o valor aparece no arquivo?</legend>
            <label className="mt-1 flex items-center gap-2">
              <input type="radio" checked={valueMode === 'single'} onChange={() => setValueMode('single')} /> Uma única coluna de valor
            </label>
            <label className="mt-1 flex items-center gap-2">
              <input type="radio" checked={valueMode === 'split'} onChange={() => setValueMode('split')} /> Colunas separadas de débito e crédito
            </label>
          </fieldset>

          {valueMode === 'single' ? (
            <>
              <label className="block text-sm">
                Coluna de valor
                <select value={amountColumn} onChange={(e) => setAmountColumn(e.target.value)} required className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
                  <option value="">Selecione…</option>
                  {detection.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="text-sm">
                <legend className="font-medium text-gray-700">Essa coluna representa</legend>
                <label className="mt-1 flex items-center gap-2">
                  <input type="radio" checked={amountMode === 'signed'} onChange={() => setAmountMode('signed')} /> Valor com sinal (negativo = saída,
                  positivo = entrada) — comum em extrato de conta
                </label>
                <label className="mt-1 flex items-center gap-2">
                  <input
                    type="radio"
                    checked={amountMode === 'card_positive_purchase'}
                    onChange={() => setAmountMode('card_positive_purchase')}
                  />{' '}
                  Valor sempre positivo representando compra — comum em fatura de cartão
                </label>
              </fieldset>
            </>
          ) : (
            <>
              <label className="block text-sm">
                Coluna de débito (saída)
                <select value={debitColumn} onChange={(e) => setDebitColumn(e.target.value === NONE ? '' : e.target.value)} className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
                  <option value={NONE}>Nenhuma</option>
                  {detection.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Coluna de crédito (entrada)
                <select value={creditColumn} onChange={(e) => setCreditColumn(e.target.value === NONE ? '' : e.target.value)} className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
                  <option value={NONE}>Nenhuma</option>
                  {detection.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <button
            type="submit"
            disabled={submitting || !dateColumn || !descriptionColumn}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Enviando…' : 'Continuar com este mapeamento'}
          </button>
        </form>
      )}

      {result?.kind === 'error' && (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {result.message}
        </p>
      )}
    </div>
  );
}

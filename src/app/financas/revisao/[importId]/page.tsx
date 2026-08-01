'use client';

import { use, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ClipboardCheck } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import { normalizeText } from '@/modules/finance/domain/normalize-text';
import { FinanceReviewRow, type ReviewRowPatch } from '@/components/finance/finance-review-row';
import type { FinanceNature } from '@/modules/finance/domain/finance-transaction.schema';

/**
 * Fila de revisão do lote (seção 8 do pedido): `?queue=id1,id2,id3&pos=0` é
 * uma coordenação puramente local via query string — nunca uma entidade de
 * lote persistida. Confirmar (ou sair de) uma importação da fila oferece a
 * próxima automaticamente.
 */
function useReviewQueue(currentImportId: string) {
  const searchParams = useSearchParams();
  const queueParam = searchParams.get('queue');
  const posParam = Number(searchParams.get('pos') ?? '0');

  const queue = useMemo(() => (queueParam ? queueParam.split(',').filter(Boolean) : []), [queueParam]);
  const position = Number.isFinite(posParam) && posParam >= 0 ? posParam : 0;
  const hasQueue = queue.length > 1;
  const nextImportId = hasQueue && position + 1 < queue.length ? queue[position + 1] : null;

  const nextHref = nextImportId ? `/financas/revisao/${nextImportId}?queue=${queue.join(',')}&pos=${position + 1}` : null;

  return { queue, position, hasQueue, nextHref, currentImportId };
}

export default function FinanceReviewPage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = use(params);
  const router = useRouter();
  const { finance: financeCommands } = useCommands();
  const { finance: financeQueries } = useQueries();
  const reviewQueue = useReviewQueue(importId);

  const {
    data: review,
    isLoading,
    error,
    isOffline,
    refetch,
  } = useReactiveQuery(() => financeQueries.queries.getImportReview(importId), [importId]);
  const { data: categories } = useReactiveQuery(() => financeQueries.queries.listCategories(), []);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const toggleSelected = (rowId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const handleSaveRow = useCallback(
    async (rowId: string, patch: ReviewRowPatch) => {
      await financeCommands.import.updateReviewRow(rowId, {
        categoryId: patch.categoryId,
        nature: patch.nature,
        description: patch.description,
      });
    },
    [financeCommands]
  );

  const handleIgnoreRow = useCallback(
    async (rowId: string) => {
      await financeCommands.import.ignoreRow(rowId);
    },
    [financeCommands]
  );

  const handleCreateRule = useCallback(
    async (input: { matchText: string; categoryId: string; nature: FinanceNature }) => {
      await financeCommands.import.createClassificationRuleFromReview({
        matchType: 'contains',
        matchText: normalizeText(input.matchText),
        categoryId: input.categoryId,
        nature: input.nature,
      });
    },
    [financeCommands]
  );

  const handleBatchCategory = async (categoryId: string) => {
    if (!categoryId || !review) return;
    for (const rowId of selected) {
      const row = review.rows.find((r) => r.id === rowId);
      if (!row) continue;
      await financeCommands.import.updateReviewRow(rowId, { categoryId });
    }
  };

  const handleBatchNature = async (nature: FinanceNature) => {
    for (const rowId of selected) {
      await financeCommands.import.updateReviewRow(rowId, { nature });
    }
  };

  const handleBatchIgnore = async () => {
    for (const rowId of selected) {
      await financeCommands.import.ignoreRow(rowId);
    }
    setSelected(new Set());
  };

  const handleConfirm = async () => {
    if (!review) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      await financeCommands.import.confirmImport(review.import.id);
      setConfirmed(true);
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : 'Não foi possível confirmar a importação.');
    } finally {
      setConfirming(false);
    }
  };

  const pendingCount = useMemo(() => (review?.rows ?? []).filter((r) => r.status !== 'ignored').length, [review]);

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <Link href="/financas" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800">
        <ArrowLeft size={14} /> Voltar para Finanças
      </Link>
      <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold">
        <ClipboardCheck size={22} className="text-blue-600" /> Revisão da importação
      </h1>
      {reviewQueue.hasQueue && (
        <p className="mt-1 text-xs font-medium text-gray-500">
          Arquivo {reviewQueue.position + 1} de {reviewQueue.queue.length}
        </p>
      )}

      {error && <DataErrorNotice isOffline={isOffline} onRetry={refetch} className="mt-4" />}

      {!error && isLoading && !review && <p className="mt-6 text-sm text-gray-500">Carregando a importação…</p>}

      {!error && !isLoading && !review && (
        <p className="mt-6 text-sm text-gray-500">Importação não encontrada.</p>
      )}

      {review && (
        <>
          <p className="mt-1 text-sm text-gray-600">
            {review.import.fileName} · {review.rows.length} lançamento(s) · status: {review.import.status === 'confirmed' ? 'confirmada' : 'em revisão'}
          </p>

          {review.import.status === 'confirmed' || confirmed ? (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              <p>Esta importação já foi confirmada. As transações estão disponíveis no painel de Finanças.</p>
              {reviewQueue.nextHref && (
                <button
                  type="button"
                  onClick={() => router.push(reviewQueue.nextHref!)}
                  className="mt-2 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800"
                >
                  Próxima importação pendente
                </button>
              )}
              {reviewQueue.hasQueue && (
                <button
                  type="button"
                  onClick={() => router.push('/financas/importar')}
                  className="ml-2 mt-2 rounded-lg border border-green-300 px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-100"
                >
                  Voltar ao resumo do lote
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <span className="text-xs text-gray-500">{selected.size} selecionado(s):</span>
                <select
                  onChange={(e) => {
                    if (e.target.value) void handleBatchCategory(e.target.value);
                    e.target.value = '';
                  }}
                  disabled={selected.size === 0}
                  aria-label="Aplicar categoria aos selecionados"
                  className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
                >
                  <option value="">Definir categoria…</option>
                  {(categories ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  onChange={(e) => {
                    if (e.target.value) void handleBatchNature(e.target.value as FinanceNature);
                    e.target.value = '';
                  }}
                  disabled={selected.size === 0}
                  aria-label="Aplicar natureza aos selecionados"
                  className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
                >
                  <option value="">Definir natureza…</option>
                  <option value="purchase">Compra</option>
                  <option value="fee">Tarifa</option>
                  <option value="transfer">Transferência</option>
                  <option value="invoice_payment">Pagamento de fatura</option>
                  <option value="refund">Estorno</option>
                  <option value="unidentified_credit">Crédito não identificado</option>
                  <option value="ignored">Ignorado</option>
                </select>
                <button
                  type="button"
                  onClick={() => void handleBatchIgnore()}
                  disabled={selected.size === 0}
                  className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                >
                  Ignorar selecionados
                </button>
              </div>

              <ul className="mt-4 space-y-2">
                {review.rows.map((row) => (
                  <div key={row.id} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleSelected(row.id)}
                      aria-label={`Selecionar lançamento ${row.description}`}
                      className="mt-4"
                    />
                    <div className="flex-1">
                      <FinanceReviewRow
                        row={row}
                        categories={categories ?? []}
                        onSave={handleSaveRow}
                        onIgnore={handleIgnoreRow}
                        onCreateRule={handleCreateRule}
                      />
                    </div>
                  </div>
                ))}
              </ul>

              <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm text-blue-900">
                  {pendingCount} lançamento(s) serão confirmados (linhas ignoradas não participam de nenhum cálculo).
                </p>
                <button
                  type="button"
                  onClick={() => void handleConfirm()}
                  disabled={confirming}
                  className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {confirming ? 'Confirmando…' : 'Confirmar importação'}
                </button>
                {confirmError && (
                  <p role="alert" className="mt-2 text-xs text-red-600">
                    {confirmError}
                  </p>
                )}
                {confirmed && (
                  <>
                    {reviewQueue.nextHref ? (
                      <button
                        type="button"
                        onClick={() => router.push(reviewQueue.nextHref!)}
                        className="ml-2 mt-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        Próxima importação pendente
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => router.push('/financas')}
                        className="ml-2 mt-2 rounded-lg border border-blue-300 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100"
                      >
                        Ver no painel de Finanças
                      </button>
                    )}
                    {reviewQueue.hasQueue && (
                      <button
                        type="button"
                        onClick={() => router.push('/financas/importar')}
                        className="ml-2 mt-2 rounded-lg border border-blue-300 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100"
                      >
                        Voltar ao resumo do lote
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

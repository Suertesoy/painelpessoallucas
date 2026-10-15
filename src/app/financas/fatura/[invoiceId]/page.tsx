'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import { todayDateStr } from '@/lib/dates';
import { ClassificationError, ClassifierControls, useClassification } from '@/components/finance-cash/item-classifier';
import { CARD_FULL_LABELS, monthLabel } from '@/modules/finance/cash/domain/month';
import { invoiceAmountCents, invoicePaymentsCents } from '@/modules/finance/cash/domain/nubank-invoice-csv';
import {
  Card, Chip, Eyebrow, Money, buttonGhost, formatDateBR, formatDateTimeBR,
} from '@/components/finance-cash/ui';

/** Detalhe de uma fatura: lançamentos, vínculos com gastos fixos e histórico de importações. */
export default function FaturaDetalhePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = use(params);
  const { financeCash } = useQueries();
  const { financeCash: commands } = useCommands();
  const { data, isLoading, error, isOffline, refetch } = useReactiveQuery(async () => {
    const [snapshot, items, imports] = await Promise.all([
      financeCash.getSnapshot(todayDateStr()),
      financeCash.listInvoiceItems(invoiceId),
      financeCash.listInvoiceImports(invoiceId),
    ]);
    return { snapshot, items, imports };
  }, [invoiceId]);

  const invoice = data?.snapshot.invoices.find((i) => i.id === invoiceId);
  // O histórico de TODAS as faturas alimenta as sugestões (mesmo estabelecimento).
  const classification = useClassification(data?.snapshot.items ?? [], {
    customCategories: data?.snapshot.customCategories ?? [],
    rules: data?.snapshot.categoryRules ?? [],
  });
  const commitments = data?.snapshot.commitments.filter((c) => c.billing === 'card' && c.card === invoice?.card && c.active) ?? [];
  const commitmentName = new Map((data?.snapshot.commitments ?? []).map((c) => [c.id, c.description]));

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-24 md:p-8">
      <Link href="/financas" className="inline-flex items-center gap-1 text-sm text-[var(--accent)]"><ArrowLeft size={14} /> Finanças</Link>
      {error && <DataErrorNotice isOffline={isOffline} onRetry={refetch} />}
      {!error && isLoading && !data && <p className="text-sm text-[var(--text-muted)]">Carregando…</p>}
      {!error && data && !invoice && <p className="text-sm text-[var(--text-muted)]">Fatura não encontrada.</p>}
      {!error && data && invoice && (
        <>
          <header>
            <h1 className="text-2xl font-bold">{CARD_FULL_LABELS[invoice.card]}</h1>
            <p className="mt-1 text-sm capitalize text-[var(--text-muted)]">Vencimento em {monthLabel(invoice.month)}</p>
          </header>

          <Card>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><Eyebrow>Valor da fatura</Eyebrow><Money cents={invoiceAmountCents(data.items)} size="lg" /></div>
              <div><Eyebrow>Pagamentos no arquivo</Eyebrow><Money cents={invoicePaymentsCents(data.items)} size="lg" tone="muted" /></div>
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Pagamento recebido é a quitação da fatura anterior: aparece aqui, mas não reduz o valor desta fatura.
            </p>
            {data.items.some((i) => i.status === 'missing') && (
              <p className="mt-2 text-xs text-[var(--money-warning)]">Há lançamentos ausentes da última importação. Seguem somados até você mantê-los ou removê-los abaixo.</p>
            )}
          </Card>

          <Card>
            <Eyebrow>Lançamentos ({data.items.length})</Eyebrow>
            <ul className="mt-2 divide-y divide-[var(--line)]">
              {data.items.map((it) => (
                <li key={it.id} className="py-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="text-[var(--text-muted)]">{formatDateBR(it.date)}</span> {it.description}
                    </span>
                    <Money cents={it.amountCents} size="sm" tone={it.kind === 'payment' ? 'muted' : it.amountCents < 0 ? 'positive' : 'default'} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    {it.kind === 'payment' && <Chip tone="info">pagamento</Chip>}
                    {it.kind === 'refund' && <Chip>estorno</Chip>}
                    {it.kind === 'adjustment' && <Chip>ajuste</Chip>}
                    {it.installmentNo && <Chip>parcela {it.installmentNo}/{it.installmentTotal}</Chip>}
                    {it.status === 'missing' && <Chip tone="warning">ausente do último arquivo — revisar</Chip>}
                    {it.status === 'missing' && invoice.status !== 'paid' && (
                      <>
                        <button type="button" className={buttonGhost} onClick={() => void commands.resolveMissingItem(it.id, 'keep')}>Manter</button>
                        <button type="button" className={buttonGhost} onClick={() => void commands.resolveMissingItem(it.id, 'remove')}>Remover</button>
                      </>
                    )}
                    {it.commitmentId && <Chip tone="positive">gasto fixo: {commitmentName.get(it.commitmentId) ?? '—'}</Chip>}
                    {it.category === null && it.kind !== 'payment' && <Chip>sem categoria</Chip>}
                    {it.kind === 'purchase' && commitments.length > 0 && (
                      <select
                        aria-label={`Vincular ${it.description} a um gasto fixo`}
                        className="rounded-lg border border-[var(--line-strong)] bg-[var(--surface-inset)] px-1.5 py-0.5 text-xs"
                        value={it.commitmentId ?? ''}
                        onChange={(e) => void commands.linkInvoiceItem(it.id, e.target.value || null)}
                      >
                        <option value="">Sem vínculo</option>
                        {commitments.map((c) => <option key={c.id} value={c.id}>{c.description}</option>)}
                      </select>
                    )}
                  </div>
                  {it.kind !== 'payment' && <ClassifierControls item={it} classification={classification} />}
                </li>
              ))}
            </ul>
            <div className="mt-3"><ClassificationError classification={classification} /></div>
          </Card>

          {data.imports.length > 0 && (
            <Card>
              <Eyebrow>Histórico de importações</Eyebrow>
              <ul className="mt-2 divide-y divide-[var(--line)] text-sm">
                {data.imports.map((imp) => (
                  <li key={imp.id} className="py-2">
                    <p>{formatDateTimeBR(imp.createdAt)} · {imp.fileName}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {imp.rowCount} linhas · {imp.newCount} novas · {imp.recognizedCount} reconhecidas · {imp.changedCount} atualizadas · {imp.missingCount} ausentes
                    </p>
                  </li>
                ))}
              </ul>
              <Link href={`/financas/fatura/importar?card=${invoice.card}&month=${invoice.month}`} className={`${buttonGhost} mt-2`}>Importar nova versão</Link>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

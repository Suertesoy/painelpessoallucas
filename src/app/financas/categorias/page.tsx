'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useReactiveQuery } from '@/lib/hooks';
import { useQueries } from '@/providers/repository.provider';
import { todayDateStr } from '@/lib/dates';
import { DataErrorNotice } from '@/components/data-error-notice';
import { CategoryManager } from '@/components/finance-cash/category-manager';

/**
 * Categorias: criar, renomear e excluir, direto no celular. Página própria
 * (e não um bloco recolhido no fim de outra tela) para ser fácil de achar.
 */
export default function CategoriasPage() {
  const { financeCash } = useQueries();
  const today = useMemo(() => todayDateStr(), []);
  const { data, isLoading, error, isOffline, refetch } = useReactiveQuery(() => financeCash.getSnapshot(today), [today]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-24 md:p-8">
      <Link href="/financas" className="text-sm text-[var(--accent)] hover:underline">← Finanças</Link>
      <h1 className="text-2xl font-bold">Categorias</h1>
      <p className="text-sm text-[var(--text-muted)]">
        Crie, renomeie ou exclua categorias. Excluir não apaga lançamentos: você escolhe para qual categoria eles vão
        (ou deixa “Sem categoria”). Valores e datas nunca mudam.
      </p>
      {error && <DataErrorNotice isOffline={isOffline} onRetry={refetch} />}
      {!error && isLoading && !data && <p className="text-sm text-[var(--text-muted)]">Carregando…</p>}
      {!error && data && <CategoryManager open categories={data.categories} persisted={data.categoriesPersisted} />}
    </div>
  );
}

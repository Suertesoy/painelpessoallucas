'use client';

import Link from 'next/link';
import type { FinanceImport } from '@/modules/finance/domain/finance-import.schema';
import type { FinanceSource } from '@/modules/finance/domain/finance-source.schema';

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Histórico de importações e seus estados, com acesso à revisão de pendentes. */
export function FinanceImportHistory({ imports, sources }: { imports: FinanceImport[]; sources: FinanceSource[] }) {
  const sourceNameById = new Map(sources.map((s) => [s.id, s.name]));

  if (imports.length === 0) {
    return <p className="mt-2 text-sm text-gray-500">Nenhuma importação ainda.</p>;
  }

  return (
    <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
      {imports.map((imp) => (
        <li key={imp.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-gray-800">{imp.fileName}</p>
            <p className="text-xs text-gray-500">
              {sourceNameById.get(imp.sourceId) ?? 'Origem removida'} · {imp.format.toUpperCase()} · {imp.rowCount} lançamento(s) ·{' '}
              {formatDateTime(imp.createdAt)}
            </p>
          </div>
          {imp.status === 'confirmed' ? (
            <span className="shrink-0 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">Confirmada</span>
          ) : (
            <Link
              href={`/financas/revisao/${imp.id}`}
              className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
            >
              Revisar pendente
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

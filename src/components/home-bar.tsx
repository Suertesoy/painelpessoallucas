'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { ActiveTimerChips } from '@/components/active-timer-chip';

/**
 * Barra discreta dentro de cada ambiente: um único caminho de volta para
 * Nossa casa (a Home é o centro). Sem lista de outros módulos.
 */
export function HomeBar({ areaLabel }: { areaLabel?: string }) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--background)] px-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
      <Link
        href="/"
        aria-label="Voltar para Nossa casa"
        className="flex min-h-12 items-center gap-1 rounded-xl px-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface)]"
      >
        <ChevronLeft size={20} aria-hidden="true" />
        Nossa casa
        {areaLabel && <span className="ml-1 font-normal text-[var(--text-muted)]">· {areaLabel}</span>}
      </Link>
      <ActiveTimerChips />
    </header>
  );
}

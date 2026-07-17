'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, Database } from 'lucide-react';
import { useMounted } from '@/lib/hooks';
import {
  readLocalData,
  hasLocalData,
  getMigrationState,
} from '@/modules/migration/local-data-migration';

/**
 * Aviso exibido quando existem dados da Fase 1 neste navegador que ainda não
 * foram migrados para a nuvem.
 */
export function MigrationBanner() {
  const pathname = usePathname();
  const mounted = useMounted();

  // Lê o localStorage somente após a hidratação (sem setState em effect).
  const visible = useMemo(() => {
    if (!mounted || pathname.startsWith('/migracao')) return false;
    return hasLocalData(readLocalData()) && !getMigrationState();
  }, [mounted, pathname]);

  if (!visible) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <div className="mx-auto flex max-w-6xl items-center gap-2">
        <Database size={16} className="shrink-0" />
        <span>Este navegador tem dados da Fase 1 que ainda não foram migrados para a nuvem.</span>
        <Link
          href="/migracao"
          className="ml-auto inline-flex shrink-0 items-center gap-1 font-medium text-amber-900 underline hover:no-underline"
        >
          Migrar agora <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

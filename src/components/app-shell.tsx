'use client';

import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { SidebarNav } from '@/components/sidebar-nav';
import { QuickCaptureModal } from '@/components/quick-capture-modal';
import { GlobalSearchModal } from '@/components/global-search-modal';
import { ItemDetailModal } from '@/components/item-detail-modal';
import { MigrationBanner } from '@/components/migration-banner';
import { useRealtimeStatus } from '@/providers/repository.provider';

const PUBLIC_PREFIXES = ['/login', '/auth'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Casca da aplicação (sidebar + modais globais). Rotas públicas (login,
 * callback OAuth) renderizam sem a casca.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isPublic(pathname)) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="flex h-dvh flex-col md:flex-row">
        <SidebarNav />
        <main className="flex-1 overflow-auto pt-14 md:pt-0">
          <RealtimeStatusBanner />
          <MigrationBanner />
          {children}
        </main>
      </div>
      <QuickCaptureModal />
      <GlobalSearchModal />
      <ItemDetailModal />
    </>
  );
}

function RealtimeStatusBanner() {
  const status = useRealtimeStatus();
  if (status === 'connected') return null;

  return (
    <div
      role="status"
      className={`border-b px-4 py-2 text-center text-xs font-medium ${
        status === 'offline'
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-blue-200 bg-blue-50 text-blue-800'
      }`}
    >
      {status === 'offline'
        ? 'Sem internet. As telas serão conferidas quando a conexão voltar.'
        : 'Reconectando e conferindo as alterações mais recentes…'}
    </div>
  );
}

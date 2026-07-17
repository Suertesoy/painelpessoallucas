'use client';

import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { SidebarNav } from '@/components/sidebar-nav';
import { QuickCaptureModal } from '@/components/quick-capture-modal';
import { GlobalSearchModal } from '@/components/global-search-modal';
import { MigrationBanner } from '@/components/migration-banner';

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
          <MigrationBanner />
          {children}
        </main>
      </div>
      <QuickCaptureModal />
      <GlobalSearchModal />
    </>
  );
}

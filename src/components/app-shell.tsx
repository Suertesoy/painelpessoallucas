'use client';

import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { HomeBar } from '@/components/home-bar';
import { QuickCaptureModal } from '@/components/quick-capture-modal';
import { GlobalSearchModal } from '@/components/global-search-modal';
import { ItemDetailModal } from '@/components/item-detail-modal';
import { MigrationBanner } from '@/components/migration-banner';
import { useRealtimeStatus } from '@/providers/repository.provider';

const PUBLIC_PREFIXES = ['/login', '/auth'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Ambiente (cômodo) da rota atual: define atmosfera e rótulo da barra. */
export function areaOf(pathname: string): { id: string; label?: string } {
  const is = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  if (is('/aprendizado')) return { id: 'estudos', label: 'Estudos' };
  if (is('/treinos')) return { id: 'treinos', label: 'Treinos' };
  if (is('/compras')) return { id: 'compras', label: 'Compras' };
  if (is('/financas')) return { id: 'financas', label: 'Finanças' };
  if (is('/notas') || is('/ideias')) return { id: 'notas', label: 'Notas' };
  if (is('/configuracoes')) return { id: 'configuracoes', label: 'Configurações' };
  return { id: 'outros' };
}

/**
 * Casca da aplicação. Não há navegação global entre módulos: a Home é o
 * centro e cada ambiente mostra apenas um caminho de volta. Rotas públicas
 * (login, callback OAuth) renderizam sem a casca.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isPublic(pathname)) {
    return <>{children}</>;
  }

  const isHome = pathname === '/';
  const area = areaOf(pathname);

  return (
    <>
      {/* Faixa sólida sob a área do relógio/Dynamic Island: o conteúdo nunca rola "por baixo" do recorte. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[60] bg-[var(--background)]" style={{ height: 'env(safe-area-inset-top)' }} />
      <div className="flex h-dvh flex-col" data-area={isHome ? undefined : area.id}>
        {!isHome && <HomeBar areaLabel={area.label} />}
        <main className="flex-1 overflow-auto">
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

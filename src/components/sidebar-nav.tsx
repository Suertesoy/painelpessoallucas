'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Settings, LogOut, ShoppingCart, Wallet, StickyNote } from 'lucide-react';
import { useAuth } from '@/providers/auth.provider';

/**
 * Navegação da central doméstica: quatro lugares e Configurações.
 * As demais rotas (Hoje, Entrada, Projetos, Planos, Aprendizado, Revisão…)
 * continuam existindo por URL, mas não aparecem aqui.
 */
const NAV_ITEMS = [
  { href: '/', label: 'Nossa casa', icon: Home },
  { href: '/compras', label: 'Compras', icon: ShoppingCart },
  { href: '/financas', label: 'Finanças', icon: Wallet },
  { href: '/notas', label: 'Notas', icon: StickyNote },
];

const SETTINGS_ITEM = { href: '/configuracoes', label: 'Configurações', icon: Settings };

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  // /ideias é a rota antiga de Notas.
  if (href === '/notas' && (pathname === '/ideias' || pathname.startsWith('/ideias/'))) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function UserFooter() {
  const { user, signOut } = useAuth();
  if (!user) return null;
  return (
    <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
      <span className="truncate text-xs text-gray-500" title={user.email ?? undefined}>
        {user.email}
      </span>
      <button
        onClick={() => void signOut()}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100"
        title="Sair"
        aria-label="Sair da conta"
      >
        <LogOut size={18} />
      </button>
    </div>
  );
}

function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Navegação principal">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-base font-medium transition-colors ${
              active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Icon size={20} className={active ? 'text-blue-600' : 'text-gray-400'} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SidebarNav() {
  const pathname = usePathname();
  const SettingsIcon = SETTINGS_ITEM.icon;
  const settingsActive = isActivePath(pathname, SETTINGS_ITEM.href);

  return (
    <>
      {/* Barra lateral (desktop) */}
      <aside className="hidden h-full w-64 shrink-0 flex-col border-r bg-white p-4 md:flex">
        <div className="mb-6 text-xl font-bold">Nossa casa</div>
        <NavLinks />
        <Link
          href={SETTINGS_ITEM.href}
          aria-current={settingsActive ? 'page' : undefined}
          className={`mt-6 flex min-h-11 items-center gap-3 rounded-xl px-3 text-base font-medium ${
            settingsActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <SettingsIcon size={20} className="text-gray-400" /> {SETTINGS_ITEM.label}
        </Link>
        <UserFooter />
      </aside>

      {/* Barra superior (mobile): só o nome e o acesso às configurações */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b bg-white px-4 md:hidden">
        <span className="text-lg font-bold">Nossa casa</span>
        <Link
          href={SETTINGS_ITEM.href}
          aria-label="Abrir configurações"
          aria-current={settingsActive ? 'page' : undefined}
          className="flex h-11 w-11 items-center justify-center rounded text-gray-600 hover:bg-gray-100"
        >
          <SettingsIcon size={22} />
        </Link>
      </header>

      {/* Barra inferior (mobile): os quatro lugares, com áreas de toque amplas */}
      <nav
        aria-label="Navegação principal (celular)"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${active ? 'text-blue-700' : 'text-gray-500'}`}
            >
              <Icon size={22} />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

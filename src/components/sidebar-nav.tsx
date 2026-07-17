'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, Plus, Menu, X, Sun, Inbox, Folder, Lightbulb, Calendar, Activity } from 'lucide-react';
import { openGlobalSearch, openQuickCapture } from '@/lib/ui-events';

const NAV_ITEMS = [
  { href: '/hoje', label: 'Hoje', icon: Sun },
  { href: '/entrada', label: 'Caixa de Entrada', icon: Inbox },
  { href: '/projetos', label: 'Projetos', icon: Folder },
  { href: '/ideias', label: 'Ideias e Insights', icon: Lightbulb },
  { href: '/agenda', label: 'Agenda', icon: Calendar },
  { href: '/revisao', label: 'Revisão', icon: Activity },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1" aria-label="Navegação principal">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={`flex items-center gap-3 p-2 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Icon size={18} className={isActive ? 'text-blue-600' : 'text-gray-400'} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SidebarNav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-64 bg-white border-r h-full flex-col p-4 shrink-0">
        <div className="font-bold text-xl mb-6 flex justify-between items-center">
          <span>Painel Lucas</span>
          <button
            onClick={openGlobalSearch}
            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
            title="Buscar (Ctrl+K)"
            aria-label="Abrir busca global"
          >
            <Search size={18} />
          </button>
        </div>

        <button
          onClick={openQuickCapture}
          className="mb-6 flex items-center justify-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          title="Captura rápida (Ctrl+Shift+Espaço)"
        >
          <Plus size={16} /> Capturar
        </button>

        <NavLinks />
      </aside>

      {/* Barra superior mobile */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 bg-white border-b flex items-center justify-between px-4 h-14">
        <span className="font-bold text-lg">Painel Lucas</span>
        <div className="flex items-center gap-1">
          <button
            onClick={openGlobalSearch}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded"
            aria-label="Abrir busca global"
          >
            <Search size={20} />
          </button>
          <button
            onClick={() => setMobileOpen(v => !v)}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded"
            aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Menu mobile (drawer) */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30 pt-14" role="dialog" aria-label="Menu">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="relative bg-white border-b shadow-lg p-4">
            <NavLinks onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Botão flutuante de captura (mobile) */}
      <button
        onClick={openQuickCapture}
        className="md:hidden fixed bottom-6 right-6 z-40 bg-blue-600 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg hover:bg-blue-700 active:scale-95 transition"
        aria-label="Captura rápida"
      >
        <Plus size={26} />
      </button>
    </>
  );
}

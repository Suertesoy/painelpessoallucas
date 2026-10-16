'use client';

import Link from 'next/link';
import { LogOut, Settings } from 'lucide-react';
import { useAuth } from '@/providers/auth.provider';
import { ActiveTimerChips } from '@/components/active-timer-chip';

/** Utilitários discretos da Home: cronômetros ativos, configurações e sair. */
export function HomeTopBar() {
  const { user, signOut } = useAuth();
  return (
    <div className="flex items-center justify-between gap-2">
      <ActiveTimerChips />
      <div className="ml-auto flex items-center gap-1">
        <Link
          href="/configuracoes"
          aria-label="Abrir configurações"
          className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
        >
          <Settings size={20} aria-hidden="true" />
        </Link>
        {user && (
          <button
            type="button"
            onClick={() => void signOut()}
            title={user.email ?? 'Sair'}
            aria-label="Sair da conta"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
          >
            <LogOut size={20} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

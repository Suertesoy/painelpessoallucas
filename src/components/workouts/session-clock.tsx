'use client';

import { Timer } from 'lucide-react';
import { useNow } from '@/lib/hooks';
import { formatClock } from '@/lib/timer';

/**
 * Cronômetro GERAL da academia: tempo corrido desde que a sessão começou
 * (timestamp gravado), independente do treino A–E em foco. Sobrevive a
 * navegar e recarregar; só some quando a sessão é encerrada.
 */
export function SessionClock({ startedAt, running = true }: { startedAt: string; running?: boolean }) {
  const now = useNow(1000);
  const seconds = running ? Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000)) : 0;
  return (
    <p className="flex items-center gap-1.5 text-sm text-gray-500" role="timer" aria-label={`Tempo de academia: ${formatClock(seconds)}`}>
      <Timer size={16} aria-hidden="true" />
      <span className="tabular text-lg font-semibold text-gray-900">{formatClock(seconds)}</span>
      <span>de academia</span>
    </p>
  );
}

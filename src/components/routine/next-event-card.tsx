'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { useRepositories } from '@/providers/repository.provider';
import { selectNextEvent } from '@/lib/next-event';

interface CalendarToday {
  connected: boolean;
  revoked?: boolean;
  busy: { start: string; end: string }[];
  events: { id: string; summary: string; start?: string; end?: string }[];
}

function formatHourBr(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatRelative(startIso: string, nowIso: string): string {
  const diffMinutes = Math.round((new Date(startIso).getTime() - new Date(nowIso).getTime()) / 60000);
  if (diffMinutes < 60) return `em ${Math.max(1, diffMinutes)}min`;
  const h = Math.floor(diffMinutes / 60);
  const m = diffMinutes % 60;
  return m === 0 ? `em ${h}h` : `em ${h}h${String(m).padStart(2, '0')}`;
}

/**
 * Card compacto do próximo compromisso — não a agenda completa (essa
 * continua em /agenda). Reaproveita a mesma rota já usada pela Home para
 * ler o calendário; não duplica a integração com o Google Calendar.
 */
export function NextEventCard({ date, now }: { date: string; now: Date }) {
  const [calendar, setCalendar] = useState<CalendarToday | null>(null);
  const { calendarEventLinkRepository } = useRepositories();

  const fetchCalendar = useCallback(async () => {
    try {
      const res = await fetch(`/api/integrations/calendar/today?date=${date}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCalendar((await res.json()) as CalendarToday);
    } catch {
      setCalendar({ connected: false, busy: [], events: [] });
    }
  }, [date]);

  useEffect(() => {
    const timer = setTimeout(() => void fetchCalendar(), 0);
    return () => clearTimeout(timer);
  }, [fetchCalendar]);

  useEffect(() => {
    return calendarEventLinkRepository.subscribe(() => void fetchCalendar());
  }, [calendarEventLinkRepository, fetchCalendar]);

  const nowIso = now.toISOString();
  const nextEvent = calendar ? selectNextEvent(calendar.events, calendar.busy, nowIso) : null;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-500">
        <CalendarClock size={15} /> Próximo compromisso
      </h3>

      {!calendar ? (
        <p className="mt-2 text-sm text-gray-400">Carregando…</p>
      ) : !calendar.connected ? (
        <p className="mt-2 text-sm text-gray-500">
          {calendar.revoked ? (
            <>Conexão expirada. <Link href="/configuracoes" className="text-blue-600 hover:underline">Reconectar</Link></>
          ) : (
            <>Não conectado. <Link href="/configuracoes" className="text-blue-600 hover:underline">Conectar</Link></>
          )}
        </p>
      ) : !nextEvent ? (
        <p className="mt-2 text-sm text-gray-400">Nenhum compromisso próximo.</p>
      ) : (
        <div className="mt-2">
          <p className="text-lg font-bold text-gray-900">{formatHourBr(nextEvent.startIso)}</p>
          <p className={`text-sm ${nextEvent.hasTitle ? 'text-gray-700' : 'text-gray-400'}`}>{nextEvent.label}</p>
          <p className="text-xs text-gray-400">{formatRelative(nextEvent.startIso, nowIso)}</p>
        </div>
      )}

      <Link href="/agenda" className="mt-3 inline-block text-xs text-blue-600 hover:underline">
        Ver agenda
      </Link>
    </section>
  );
}

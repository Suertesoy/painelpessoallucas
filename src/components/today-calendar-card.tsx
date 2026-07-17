'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, Gauge } from 'lucide-react';
import type { Item } from '@/modules/items/domain/item.schema';
import {
  computeCapacity,
  formatMinutes,
  type CapacitySummary,
} from '@/lib/capacity';

interface CalendarToday {
  connected: boolean;
  revoked?: boolean;
  busy: { start: string; end: string }[];
  events: { id: string; summary: string; start?: string; end?: string; painelItemId?: string }[];
}

function formatHourBr(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * Compromissos do Google Calendar + tempo comprometido/capacidade do dia.
 * Sobreposições nunca contam duas vezes (intervalos mesclados).
 */
export function TodayCalendarCard({
  date,
  scheduledItems,
  focusItems,
  onCapacityChange,
}: {
  date: string;
  scheduledItems: Item[];
  focusItems: Item[];
  onCapacityChange?: (summary: CapacitySummary, busy: { start: string; end: string }[]) => void;
}) {
  const [calendar, setCalendar] = useState<CalendarToday | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/integrations/calendar/today?date=${date}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setCalendar((await res.json()) as CalendarToday);
        setError(null);
      } catch {
        setError('Não foi possível carregar o Google Calendar.');
        setCalendar({ connected: false, busy: [], events: [] });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [date]);

  const busy = calendar?.busy ?? [];
  const unscheduledFocus = focusItems.filter((f) => !f.scheduledAt);
  const capacity = computeCapacity({
    busyBlocks: busy,
    scheduledItems,
    unscheduledFocusItems: unscheduledFocus,
  });

  useEffect(() => {
    onCapacityChange?.(capacity, busy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capacity.committedMinutes, calendar]);

  const barPercent = Math.min(
    100,
    Math.round((capacity.committedMinutes / capacity.capacityMinutes) * 100)
  );

  return (
    <section className="bg-white rounded-xl shadow-sm border p-4 md:p-6">
      <h2 className="text-lg font-bold flex items-center gap-2 mb-3">
        <Gauge className="text-teal-500" /> Capacidade do dia
      </h2>

      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">Comprometido: {formatMinutes(capacity.committedMinutes)}</span>
        <span className={capacity.overCapacity ? 'font-medium text-red-600' : 'text-gray-600'}>
          {capacity.overCapacity
            ? `Excedido em ${formatMinutes(-capacity.remainingMinutes)}`
            : `Livre: ${formatMinutes(capacity.remainingMinutes)}`}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full ${capacity.overCapacity ? 'bg-red-500' : barPercent > 75 ? 'bg-amber-400' : 'bg-teal-500'}`}
          style={{ width: `${barPercent}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-gray-400">
        Jornada de referência: {formatMinutes(capacity.capacityMinutes)} · sobreposições contam uma vez
      </p>

      <h3 className="mt-5 flex items-center gap-2 text-sm font-semibold text-gray-700">
        <Calendar size={15} className="text-blue-500" /> Compromissos do Google Calendar
      </h3>

      {!calendar ? (
        <p className="mt-2 text-sm text-gray-400">Carregando…</p>
      ) : !calendar.connected ? (
        <p className="mt-2 text-sm text-gray-500">
          {calendar.revoked ? (
            <>Conexão expirada. <Link href="/configuracoes" className="text-blue-600 hover:underline">Reconectar</Link></>
          ) : (
            <>Não conectado. <Link href="/configuracoes" className="text-blue-600 hover:underline">Conectar em Configurações</Link></>
          )}
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm">
          {calendar.events.map((event) => (
            <li key={event.id} className="flex items-center gap-2">
              <span className="w-11 shrink-0 text-xs font-semibold text-blue-700">
                {event.start ? formatHourBr(event.start) : '—'}
              </span>
              <span className="truncate">{event.summary}</span>
              <span className="ml-auto shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
                Painel Lucas
              </span>
            </li>
          ))}
          {calendar.busy.map((block, i) => (
            <li key={`busy-${i}`} className="flex items-center gap-2 text-gray-500">
              <span className="w-11 shrink-0 text-xs font-semibold">
                {formatHourBr(block.start)}
              </span>
              <span>Ocupado até {formatHourBr(block.end)}</span>
              <span className="ml-auto shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                agenda principal
              </span>
            </li>
          ))}
          {calendar.events.length === 0 && calendar.busy.length === 0 && (
            <li className="text-gray-400">Nenhum compromisso hoje.</li>
          )}
        </ul>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}

'use client';

import React, { useState, useMemo } from 'react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import { ItemCompleteButton } from '@/components/item-complete-button';
import { openItemDetail } from '@/lib/ui-events';
import { Calendar, Folder, FileText, ChevronLeft, ChevronRight, MapPin, Video, ExternalLink } from 'lucide-react';
import { format, addDays, subDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, parseISO, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { zonedDateTimeToUtc } from '@/modules/plans/domain/recurrence-engine';
import type { CalendarEventLink } from '@/platform/integrations/calendar-event-link.repository';
import type { Item } from '@/modules/items/domain/item.schema';

function formatHourBr(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

type AgendaEntry =
  | { kind: 'item'; time: string; item: Item }
  | { kind: 'calendar'; time: string; event: CalendarEventLink };

export default function AgendaPage() {
  const { item: itemQueries, project: projectQueries, calendarEvent: calendarEventQueries } = useQueries();
  const { item: itemCmds } = useCommands();

  const {
    data: items,
    isLoading: isLoadingItems,
    error: itemsError,
    isOffline,
    refetch: refetchItems,
  } = useReactiveQuery(() => itemQueries.listItems(), []);
  const {
    data: projects,
    isLoading: isLoadingProjects,
    error: projectsError,
    refetch: refetchProjects,
  } = useReactiveQuery(() => projectQueries.listProjects(), []);
  const error = itemsError ?? projectsError;
  const refetch = () => {
    refetchItems();
    refetchProjects();
  };

  const [currentDate, setCurrentDate] = useState(new Date());
  const currentDateStr = format(currentDate, 'yyyy-MM-dd');

  const {
    data: calendarEvents,
    error: calendarEventsError,
  } = useReactiveQuery(
    () =>
      calendarEventQueries.listInRange(
        zonedDateTimeToUtc(currentDateStr, '00:00', 'America/Sao_Paulo').toISOString(),
        zonedDateTimeToUtc(currentDateStr, '23:59', 'America/Sao_Paulo').toISOString()
      ),
    [currentDateStr]
  );

  const daysOfWeek = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const selectedDayItems = useMemo(() => {
    if (!items || !projects) return { scheduled: [], due: [], projectDue: [] };
    
    const targetDate = startOfDay(currentDate);

    const scheduled = items.filter(i => {
      if (!i.scheduledAt || i.status === 'archived') return false;
      return isSameDay(parseISO(i.scheduledAt), targetDate);
    }).sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());

    const due = items.filter(i => {
      if (!i.dueAt || i.status === 'archived' || i.status === 'completed') return false;
      return isSameDay(parseISO(i.dueAt), targetDate);
    });

    const projectDue = projects.filter(p => {
      if (!p.dueAt || p.status === 'completed' || p.status === 'archived') return false;
      return isSameDay(parseISO(p.dueAt), targetDate);
    });

    return { scheduled, due, projectDue };
  }, [items, projects, currentDate]);

  const agendaEntries = useMemo<AgendaEntry[]>(() => {
    const fromItems: AgendaEntry[] = selectedDayItems.scheduled.map((item) => ({
      kind: 'item',
      time: item.scheduledAt!,
      item,
    }));
    const fromEvents: AgendaEntry[] = (calendarEvents ?? [])
      .filter((event) => !!event.startAt)
      .map((event) => ({ kind: 'calendar', time: event.startAt!, event }));
    return [...fromItems, ...fromEvents].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }, [selectedDayItems.scheduled, calendarEvents]);

  const handleComplete = async (id: string) => {
    await itemCmds.completeItem(id);
  };

  if (isLoadingItems || isLoadingProjects) {
    return <div className="p-4 md:p-8 max-w-4xl mx-auto">Carregando Agenda...</div>;
  }

  if (error) {
    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2 mb-6">
          <Calendar className="text-blue-600" /> Agenda
        </h1>
        <DataErrorNotice isOffline={isOffline} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="text-blue-600" /> Agenda
          </h1>
          <p className="text-gray-600 mt-1">Sua programação e prazos (Agendamentos e Due Dates).</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md font-medium text-gray-700">
            Hoje
          </button>
          <div className="flex items-center gap-1 bg-white border rounded-lg p-1 shadow-sm">
            <button onClick={() => setCurrentDate(subDays(currentDate, 7))} className="p-1 hover:bg-gray-100 rounded text-gray-600"><ChevronLeft size={20}/></button>
            <span className="text-sm font-medium w-32 text-center capitalize">{format(currentDate, "MMMM yyyy", { locale: ptBR })}</span>
            <button onClick={() => setCurrentDate(addDays(currentDate, 7))} className="p-1 hover:bg-gray-100 rounded text-gray-600"><ChevronRight size={20}/></button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col mb-6">
        <div className="grid grid-cols-7 border-b bg-gray-50">
          {daysOfWeek.map(day => {
            const isToday = isSameDay(day, new Date());
            const isSelected = isSameDay(day, currentDate);
            
            return (
              <button
                key={day.toISOString()}
                onClick={() => setCurrentDate(day)}
                className={`py-3 flex flex-col items-center justify-center border-r last:border-r-0 hover:bg-blue-50 transition-colors ${
                  isSelected ? 'bg-blue-50 relative' : ''
                }`}
              >
                <span className={`text-xs font-medium uppercase mb-1 ${isToday ? 'text-blue-600' : 'text-gray-500'}`}>
                  {format(day, 'E', { locale: ptBR })}
                </span>
                <span className={`text-xl font-bold w-8 h-8 flex items-center justify-center rounded-full ${
                  isSelected ? 'bg-blue-600 text-white' : isToday ? 'text-blue-600 bg-blue-100' : 'text-gray-900'
                }`}>
                  {format(day, 'd')}
                </span>
                {isSelected && <div className="absolute bottom-0 w-full h-1 bg-blue-600" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white rounded-xl shadow-sm border p-6 space-y-8">
        <div className="text-xl font-bold border-b pb-2 mb-6 capitalize flex items-center gap-2">
          {format(currentDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
        </div>

        {agendaEntries.length === 0 &&
        selectedDayItems.due.length === 0 &&
        selectedDayItems.projectDue.length === 0 &&
        !calendarEventsError ? (
          <div className="text-center text-gray-500 py-10">
            <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-lg font-medium">Nenhum compromisso.</p>
            <p className="text-sm">Seu dia está livre.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            <div>
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-500"></div> Agendamentos
              </h3>
              {calendarEventsError && (
                <p className="mb-2 text-xs text-red-600">Não foi possível carregar os eventos de calendário.</p>
              )}
              {agendaEntries.length === 0 ? (
                <p className="text-gray-400 text-sm">Nada agendado para este dia.</p>
              ) : (
                <div className="space-y-3">
                  {agendaEntries.map((entry) =>
                    entry.kind === 'item' ? (
                      <div key={`item-${entry.item.id}`} className="flex gap-4 p-3 border rounded-lg bg-purple-50/30 group">
                        <div className="text-sm font-bold text-purple-700 pt-0.5 shrink-0 w-12">
                          {format(parseISO(entry.item.scheduledAt!), 'HH:mm')}
                        </div>
                        <button
                          type="button"
                          onClick={() => openItemDetail(entry.item.id)}
                          className={`min-w-0 flex-1 text-left font-medium hover:underline ${entry.item.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}
                        >
                          {entry.item.title}
                          {entry.item.projectId && (
                            <div className="text-xs font-normal text-gray-500 mt-1 truncate">
                              {projects?.find(p => p.id === entry.item.projectId)?.name}
                            </div>
                          )}
                        </button>
                        {entry.item.type === 'task' && (
                          <ItemCompleteButton
                            itemId={entry.item.id}
                            title={entry.item.title ?? 'item'}
                            isCompleted={entry.item.status === 'completed'}
                            onComplete={handleComplete}
                          />
                        )}
                      </div>
                    ) : (
                      <div key={`event-${entry.event.id}`} className="flex gap-4 p-3 border rounded-lg bg-blue-50/30">
                        <div className="text-sm font-bold text-blue-700 pt-0.5 shrink-0 w-12">
                          {formatHourBr(entry.event.startAt!)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => openItemDetail(entry.event.itemId)}
                            className="text-left font-medium text-gray-900 hover:underline"
                          >
                            {entry.event.title ?? '(sem título)'}
                          </button>
                          {entry.event.createdByPanel && (
                            <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                              Criado pelo painel
                            </span>
                          )}
                          <div className="mt-1 flex flex-wrap gap-3 text-xs">
                            {entry.event.htmlLink && (
                              <a
                                href={entry.event.htmlLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                              >
                                <ExternalLink size={11} /> Google Agenda
                              </a>
                            )}
                            {entry.event.modality === 'in_person' && entry.event.location && (
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(entry.event.location)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                              >
                                <MapPin size={11} /> Maps
                              </a>
                            )}
                            {entry.event.modality === 'online' && entry.event.meetingLink && (
                              <a
                                href={entry.event.meetingLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                              >
                                <Video size={11} /> Reunião
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500"></div> Prazos (Due Dates)
              </h3>
              {selectedDayItems.due.length === 0 && selectedDayItems.projectDue.length === 0 ? (
                <p className="text-gray-400 text-sm">Nenhum prazo vence hoje.</p>
              ) : (
                <div className="space-y-3">
                  {selectedDayItems.projectDue.map(proj => (
                    <div key={proj.id} className="flex items-center gap-3 p-3 border rounded-lg bg-red-50/50">
                      <Folder size={18} className="text-red-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-red-600 font-bold">PROJETO VENCE HOJE</div>
                        <div className="font-medium text-gray-900 truncate">{proj.name}</div>
                      </div>
                    </div>
                  ))}
                  
                  {selectedDayItems.due.map(item => (
                    <div key={item.id} className="flex gap-3 p-3 border rounded-lg hover:bg-gray-50 group">
                      <FileText size={18} className="text-gray-400 shrink-0 mt-0.5" />
                      <button
                        type="button"
                        onClick={() => openItemDetail(item.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="font-medium text-gray-900 hover:underline">{item.title}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                          <span className="text-red-600 font-medium">Prazo Final</span>
                          {item.projectId && <span>• {projects?.find(p => p.id === item.projectId)?.name}</span>}
                        </div>
                      </button>
                      {item.type === 'task' && (
                        <ItemCompleteButton
                          itemId={item.id}
                          title={item.title ?? 'item'}
                          isCompleted={item.status === 'completed'}
                          onComplete={handleComplete}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

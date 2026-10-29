'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ChevronDown } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useQueries } from '@/providers/repository.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import { formatDuration, type HistoryEntry } from '@/modules/workouts/domain/workout-history';
import { formatKg } from '@/modules/workouts/domain/workout.schema';

const PAGE = 30;
const STATUS_TEXT = { in_progress: 'Em andamento', completed: 'Encerrada', cancelled: 'Cancelada' } as const;

const formatDay = (day: string) => format(parseISO(`${day}T00:00:00`), 'dd/MM/yyyy');
const formatTime = (iso: string) => format(new Date(iso), 'HH:mm');

function titleOf(entry: HistoryEntry): string {
  if (entry.dayCodes.length === 0) return 'Sem séries registradas';
  return entry.dayCodes.length === 1 ? `Treino ${entry.dayCodes[0]}` : `Treinos ${entry.dayCodes.join(' + ')}`;
}

function EntryCard({ entry }: { entry: HistoryEntry }) {
  const [open, setOpen] = useState(false);
  const { session } = entry;
  const multi = entry.dayCodes.length > 1;
  return (
    <li className="rounded-2xl border border-gray-200 bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-16 w-full items-center gap-3 p-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2">
            <span className="font-semibold text-gray-900">{titleOf(entry)}</span>
            <span className="text-sm text-gray-500">{formatDay(session.sessionDate)}</span>
          </span>
          <span className="mt-0.5 block text-xs text-gray-600">
            {entry.durationSeconds !== null ? formatDuration(entry.durationSeconds) : 'em andamento'}
            {' · '}
            {entry.totalSets} {entry.totalSets === 1 ? 'série' : 'séries'}
            {' · '}
            {entry.exerciseCount} {entry.exerciseCount === 1 ? 'exercício' : 'exercícios'}
          </span>
          <span className="mt-1 flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">{STATUS_TEXT[session.status]}</span>
            {entry.completedDayCodes.length > 0 && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">
                Concluído: {entry.completedDayCodes.join(', ')}
              </span>
            )}
            {entry.atypicalDuration && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                Duração atípica — confira o horário de encerramento
              </span>
            )}
          </span>
        </span>
        <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-gray-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-gray-100 px-3 pb-3 pt-2">
          <p className="text-xs text-gray-500">
            Início {formatTime(session.startedAt)}
            {session.endedAt ? ` · término ${formatTime(session.endedAt)}` : ''}
            {multi && ' · duração total da sessão (não dividida entre as fichas)'}
          </p>
          {entry.exercises.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">Nenhuma série foi registrada nesta sessão.</p>
          ) : (
            <ul className="mt-2 space-y-3">
              {entry.exercises.map((ex) => (
                <li key={ex.exerciseId}>
                  <p className="text-sm font-medium text-gray-900">
                    {multi && <span className="mr-1 rounded bg-blue-50 px-1.5 text-xs font-semibold text-blue-700">{ex.dayCode}</span>}
                    {ex.name}
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      {ex.sets.length} {ex.sets.length === 1 ? 'série' : 'séries'}
                    </span>
                  </p>
                  <ol className="mt-1 grid gap-0.5 text-sm text-gray-700">
                    {ex.sets.map((set) => (
                      <li key={set.setNumber} className="flex justify-between gap-3">
                        <span className="text-gray-500">Série {set.setNumber}</span>
                        <span className="tabular-nums">
                          {set.loadKg != null ? `${formatKg(set.loadKg)} kg` : 'sem carga'} × {set.reps}
                        </span>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

export default function HistoricoPage({ params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = use(params);
  const { workout: queries } = useQueries();
  const [limit, setLimit] = useState(PAGE);
  const { data, isLoading, error, isOffline, refetch } = useReactiveQuery(() => queries.getWorkoutHistory(athleteId, limit), [athleteId, limit]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <DataErrorNotice isOffline={isOffline} onRetry={refetch} />
      </div>
    );
  }
  if (isLoading && !data) return <div className="p-4 text-sm text-gray-500 md:p-8">Carregando histórico…</div>;
  if (!data) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <p role="alert" className="text-sm text-gray-600">Pessoa não encontrada.</p>
        <Link href="/treinos" className="text-sm text-blue-600 hover:underline">← Treinos</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <Link href={`/treinos/${athleteId}`} className="text-sm text-blue-600 hover:underline">← {data.athlete.name}</Link>
      <h1 className="mt-2 text-3xl font-bold text-gray-900">Histórico de treinos</h1>
      <p className="mt-1 text-sm text-gray-500">{data.athlete.name} · do mais recente para o mais antigo. Toque para ver as séries.</p>

      {data.entries.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">Nenhum treino registrado ainda.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {data.entries.map((entry) => <EntryCard key={entry.session.id} entry={entry} />)}
        </ul>
      )}

      {data.hasMore && (
        <button
          type="button"
          onClick={() => setLimit(limit + PAGE)}
          className="mt-4 min-h-12 w-full rounded-2xl border border-gray-300 bg-white text-sm font-medium text-gray-800"
        >
          Ver treinos mais antigos
        </button>
      )}
    </div>
  );
}

'use client';

import { use, useRef, useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ChevronDown, MoreVertical } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { SwipeDeleteRow } from '@/components/workouts/swipe-delete-row';
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

function EntryCard({ entry, onRequestDelete }: { entry: HistoryEntry; onRequestDelete: (entry: HistoryEntry) => void }) {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { session } = entry;
  const multi = entry.dayCodes.length > 1;
  const canDelete = session.status !== 'in_progress';
  const card = (
    <div className="rounded-2xl bg-white">
      <div className="flex items-start">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-16 min-w-0 flex-1 items-center gap-3 p-3 text-left"
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
      {canDelete && (
        <div className="relative shrink-0 p-1">
          <button
            type="button"
            aria-label={`Opções do ${titleOf(entry)} de ${formatDay(session.sessionDate)}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex size-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <MoreVertical size={18} aria-hidden="true" />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-1 top-12 z-10 w-40 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                role="menuitem"
                onClick={() => { setMenuOpen(false); onRequestDelete(entry); }}
                className="min-h-11 w-full px-3 text-left text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Excluir treino
              </button>
            </div>
          )}
        </div>
      )}
      </div>

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
    </div>
  );
  return (
    <li className="rounded-2xl border border-gray-200 bg-white">
      {canDelete ? <SwipeDeleteRow onRequestDelete={() => onRequestDelete(entry)}>{card}</SwipeDeleteRow> : card}
    </li>
  );
}

function DeleteDialog({ entry, busy, error, onCancel, onConfirm }: {
  entry: HistoryEntry; busy: boolean; error: string | null; onCancel: () => void; onConfirm: () => void;
}) {
  const hasSets = entry.totalSets > 0;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="delete-session-title">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <h2 id="delete-session-title" className="text-lg font-semibold text-gray-900">Excluir este treino do histórico?</h2>
        <p className="mt-2 text-sm text-gray-700">
          {titleOf(entry)} · {formatDay(entry.session.sessionDate)}
          {entry.durationSeconds !== null ? ` · ${formatDuration(entry.durationSeconds)}` : ''}
        </p>
        {hasSets ? (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
            Esta sessão tem {entry.totalSets} {entry.totalSets === 1 ? 'série registrada' : 'séries registradas'}
            {entry.dayCodes.length > 1 ? ` em ${entry.dayCodes.length} fichas (${entry.dayCodes.join(', ')}) — todas serão removidas juntas` : ''}.
            Elas deixam de contar no histórico, nos gráficos e nas estatísticas.
          </p>
        ) : (
          <p className="mt-2 text-sm text-gray-600">Esta sessão não tem séries registradas.</p>
        )}
        <p className="mt-2 text-xs text-gray-500">Nada é apagado de verdade: você poderá desfazer agora ou restaurar depois em “Treinos excluídos”.</p>
        {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-xl border border-gray-300 px-4 text-sm font-medium text-gray-700 disabled:opacity-60">
            Cancelar
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? 'Excluindo…' : 'Excluir treino'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HistoricoPage({ params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = use(params);
  const { workout: queries } = useQueries();
  const { workout: cmds } = useCommands();
  const [limit, setLimit] = useState(PAGE);
  const { data, isLoading, error, isOffline, refetch } = useReactiveQuery(() => queries.getWorkoutHistory(athleteId, limit), [athleteId, limit]);
  const deleted = useReactiveQuery(() => queries.getDeletedWorkouts(athleteId), [athleteId]);
  const [pending, setPending] = useState<HistoryEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ sessionId: string; label: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function confirmDelete() {
    if (!pending) return;
    setBusy(true);
    setActionError(null);
    try {
      await cmds.deleteSession(athleteId, pending.session.id);
      setUndo({ sessionId: pending.session.id, label: `${titleOf(pending)} de ${formatDay(pending.session.sessionDate)}` });
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndo(null), 10000);
      setPending(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Não foi possível excluir o treino.');
    } finally {
      setBusy(false);
    }
  }

  async function restore(sessionId: string) {
    setActionError(null);
    try {
      await cmds.restoreSession(athleteId, sessionId);
      setUndo((u) => (u?.sessionId === sessionId ? null : u));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Não foi possível restaurar o treino.');
    }
  }

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
          {data.entries.map((entry) => <EntryCard key={entry.session.id} entry={entry} onRequestDelete={(e) => { setActionError(null); setPending(e); }} />)}
        </ul>
      )}

      {actionError && !pending && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{actionError}</p>}

      {deleted.data && deleted.data.length > 0 && (
        <details className="mt-6 rounded-2xl border border-gray-200 bg-white p-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-800">Treinos excluídos ({deleted.data.length})</summary>
          <ul className="mt-2 divide-y divide-gray-100">
            {deleted.data.map((entry) => (
              <li key={entry.session.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 text-sm text-gray-700">
                  {titleOf(entry)} · {formatDay(entry.session.sessionDate)}
                  <span className="block text-xs text-gray-500">{entry.totalSets} {entry.totalSets === 1 ? 'série' : 'séries'}</span>
                </span>
                <button type="button" onClick={() => void restore(entry.session.id)} className="min-h-11 shrink-0 rounded-xl border border-gray-300 px-3 text-sm font-medium text-gray-800">
                  Restaurar
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {pending && (
        <DeleteDialog entry={pending} busy={busy} error={actionError} onCancel={() => { setPending(null); setActionError(null); }} onConfirm={() => void confirmDelete()} />
      )}

      {undo && (
        <div role="status" className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-gray-900 p-3 text-sm text-white shadow-lg">
          <span>{undo.label} excluído.</span>
          <button type="button" onClick={() => void restore(undo.sessionId)} className="min-h-11 rounded-xl px-3 font-semibold text-blue-300">
            Desfazer
          </button>
        </div>
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

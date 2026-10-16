'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ExternalLink, Info, Minus, Plus, Play, Undo2 } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { useWorkspace } from '@/providers/auth.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import { RestTimerBar } from '@/components/workouts/rest-timer-bar';
import { AthleteSwitch } from '@/components/workouts/athlete-switch';
import { LoadField } from '@/components/workouts/load-field';
import { SessionClock } from '@/components/workouts/session-clock';
import { unlockAudio } from '@/lib/beep';
import { loadForSet } from '@/modules/workouts/domain/workout-stats';
import {
  DEFAULT_REST_SECONDS,
  formatKg,
  formatPrescription,
  formatRest,
  type SetLog,
} from '@/modules/workouts/domain/workout.schema';
import type { SessionExerciseView } from '@/modules/workouts/application/workout.queries';

function parseReps(value: string): number | undefined | null {
  const t = value.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export default function SessaoPage({ params }: { params: Promise<{ athleteId: string; sessionId: string }> }) {
  const { athleteId, sessionId } = use(params);
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  const { workout: cmds } = useCommands();
  const { workout: queries } = useQueries();
  const { data, isLoading, error, isOffline, refetch } = useReactiveQuery(() => queries.getSessionView(sessionId), [sessionId]);
  const [viewId, setViewId] = useState<string | null>(null);
  const [repsDraft, setRepsDraft] = useState<Record<string, string>>({});
  const [liveLoad, setLiveLoad] = useState<Record<string, number | undefined>>({});
  const [extraSets, setExtraSets] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <DataErrorNotice isOffline={isOffline} onRetry={refetch} />
      </div>
    );
  }
  if (isLoading && !data) return <div className="p-4 text-sm text-gray-500 md:p-8">Carregando treino…</div>;
  if (!data) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <p role="alert" className="text-sm text-gray-600">Treino não encontrado.</p>
        <Link href={`/treinos/${athleteId}`} className="text-sm text-blue-600 hover:underline">← Voltar</Link>
      </div>
    );
  }

  const { session, athlete, athletes, day, days, exercises, totalSets, setsByDay } = data;
  const readOnly = session.status !== 'in_progress';
  const currentView = viewId ?? athlete.id;
  const viewed = athletes.find((a) => a.id === currentView) ?? athlete;
  const isOwn = viewed.id === athlete.id;
  const repsKey = (exerciseId: string, n: number) => `${exerciseId}:${n}`;

  /** Carga em uso (a que está no campo; senão a salva) — vale para todas as séries do exercício. */
  const effectiveLoad = (view: SessionExerciseView): number | undefined =>
    view.exercise.id in liveLoad ? liveLoad[view.exercise.id] : view.loadsByAthlete[athlete.id]?.loadKg;

  const defaultReps = (view: SessionExerciseView, n: number, logged?: SetLog): string => {
    if (logged) return String(logged.reps);
    const prev = view.previous?.sets.find((s) => s.setNumber === n) ?? view.previous?.sets[view.previous.sets.length - 1];
    const reps = prev?.reps ?? view.exercise.repsMax ?? view.exercise.repsMin;
    return reps != null ? String(reps) : '';
  };

  const saveLoad = async (exerciseId: string, athleteIdToSave: string, kg: number | undefined) => {
    setMessage(null);
    try {
      await cmds.setAthleteLoad(workspaceId, { exerciseId, athleteId: athleteIdToSave, loadKg: kg });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível salvar a carga.');
    }
  };

  const completeSet = async (view: SessionExerciseView, n: number, logged?: SetLog) => {
    unlockAudio(); // o toque libera o áudio no iPhone para o aviso do descanso
    const reps = parseReps(repsDraft[repsKey(view.exercise.id, n)] ?? defaultReps(view, n, logged));
    if (reps === undefined || reps === null) {
      setMessage('Informe quantas repetições você fez nesta série.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const rest = view.exercise.restSeconds ?? DEFAULT_REST_SECONDS;
      // A carga é a do exercício (uma só). Corrigir uma série já feita não reinicia o descanso.
      // Série nova usa a carga atual; série já feita preserva a carga com que foi feita.
      await cmds.completeSet(session.id, { exerciseId: view.exercise.id, setNumber: n, loadKg: loadForSet(logged, effectiveLoad(view)), reps }, logged ? undefined : rest);
      setRepsDraft((d) => {
        const copy = { ...d };
        delete copy[repsKey(view.exercise.id, n)];
        return copy;
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível registrar a série.');
    } finally {
      setBusy(false);
    }
  };

  const startRestNow = async (view: SessionExerciseView) => {
    unlockAudio();
    setMessage(null);
    try {
      await cmds.startRest(session.id, view.exercise.restSeconds ?? DEFAULT_REST_SECONDS);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível iniciar o descanso.');
    }
  };

  const changeRest = async (view: SessionExerciseView, delta: number) => {
    setMessage(null);
    try {
      await cmds.setExerciseRest(view.exercise.id, (view.exercise.restSeconds ?? DEFAULT_REST_SECONDS) + delta);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível ajustar o descanso.');
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      await cmds.finishSession(session.id);
      router.push(`/treinos/${athleteId}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível concluir.');
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!window.confirm('Cancelar esta sessão? As séries registradas não entram na evolução.')) return;
    setBusy(true);
    try {
      await cmds.cancelSession(session.id);
      router.push(`/treinos/${athleteId}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível cancelar.');
      setBusy(false);
    }
  };

  const totalLogged = totalSets;

  const focus = async (dayId: string) => {
    if (dayId === day.id) return;
    setMessage(null);
    try {
      await cmds.focusDay(session.id, dayId);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível trocar de treino.');
    }
  };
  const small = 'flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-gray-300 bg-white px-2 text-sm text-gray-700 disabled:opacity-40';

  return (
    <div className="mx-auto max-w-2xl p-4 pb-48 md:p-8 md:pb-48">
      <Link href={`/treinos/${athleteId}`} className="text-sm text-blue-600 hover:underline">← {athlete.name}</Link>
      <div className="mt-2 flex items-start justify-between gap-3">
        <h1 className="text-3xl font-bold text-gray-900">
          Treino {day.code} <span className="text-lg font-normal text-gray-500">· {athlete.name}</span>
        </h1>
      </div>
      <div className="mt-1">
        <SessionClock startedAt={session.startedAt} running={!readOnly} />
      </div>

      {/* Trocar de treino não encerra nada: o cronômetro e as séries continuam */}
      <nav aria-label="Trocar de treino" className="mt-3 flex flex-wrap gap-2">
        {days.map((d) => (
          <button
            key={d.id}
            type="button"
            aria-pressed={d.id === day.id}
            disabled={readOnly}
            onClick={() => void focus(d.id)}
            className={`min-h-11 min-w-11 rounded-xl border px-3 text-sm font-semibold ${d.id === day.id ? 'border-blue-500 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700'}`}
          >
            {d.code}
            {(setsByDay[d.id] ?? 0) > 0 && <span className="ml-1 text-xs font-normal opacity-80">·{setsByDay[d.id]}</span>}
          </button>
        ))}
      </nav>
      {readOnly && <p className="mt-2 text-sm text-gray-500">Este treino já foi encerrado.</p>}

      <div className="mt-4">
        <AthleteSwitch athletes={athletes} value={currentView} ownId={athlete.id} onChange={setViewId} />
        {!isOwn && (
          <p className="mt-2 rounded-xl bg-blue-50 p-3 text-xs text-blue-900">
            Treinando junto: aqui você vê e ajusta as <strong>cargas de {viewed.name}</strong>. As séries dele são registradas no treino dele.{' '}
            <Link href={`/treinos/${viewed.id}`} className="underline">Abrir treino de {viewed.name}</Link>
          </p>
        )}
      </div>

      {message && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</p>}

      <ol className="mt-5 space-y-4">
        {exercises.map((view) => {
          const { exercise } = view;
          const rest = exercise.restSeconds ?? DEFAULT_REST_SECONDS;
          const savedLoad = view.loadsByAthlete[viewed.id];
          const prev = view.previousByAthlete[viewed.id];
          const setCount = Math.max(exercise.sets, ...view.logs.map((l) => l.setNumber)) + (extraSets[exercise.id] ?? 0);
          const done = view.logs.length >= exercise.sets;
          return (
            <li key={exercise.id} className={`rounded-3xl border bg-white p-4 ${isOwn && done ? 'border-emerald-300' : 'border-gray-200'}`}>
              <h2 className="font-semibold text-gray-900">{exercise.name}</h2>
              <p className="mt-0.5 text-sm text-gray-600">{formatPrescription(exercise)}</p>

              {/* Carga: uma só por exercício */}
              <div className="mt-3">
                <LoadField
                  key={`${exercise.id}:${viewed.id}:${savedLoad?.loadKg ?? ''}`}
                  initial={savedLoad?.loadKg}
                  disabled={readOnly}
                  onChange={isOwn ? (kg) => setLiveLoad((l) => ({ ...l, [exercise.id]: kg })) : undefined}
                  onCommit={(kg) => {
                    if (kg !== savedLoad?.loadKg) void saveLoad(exercise.id, viewed.id, kg);
                  }}
                />
                {savedLoad?.loadKg == null && savedLoad?.loadNote && (
                  <p className="mt-1 text-xs text-amber-700">Anotado na planilha: “{savedLoad.loadNote}”</p>
                )}
                {prev && (
                  <p className="mt-1 text-xs text-gray-500">
                    Última vez ({prev.date.split('-').reverse().slice(0, 2).join('/')}):{' '}
                    {prev.sets[0]?.loadKg != null ? `${formatKg(prev.sets[0].loadKg)} kg · ` : ''}
                    {prev.sets.map((s) => s.reps).join(', ')} reps
                  </p>
                )}
              </div>

              {isOwn && (
                <>
                  {/* Descanso do exercício: já vem configurado, dá para ajustar e disparar */}
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-gray-50 p-2">
                    <div className="flex items-center gap-1">
                      <button type="button" className={small} aria-label={`Menos 15 segundos de descanso em ${exercise.name}`} disabled={readOnly} onClick={() => void changeRest(view, -15)}>
                        <Minus size={14} />
                      </button>
                      <span className="min-w-24 text-center text-sm">
                        <span className="block text-[11px] uppercase tracking-wide text-gray-500">Descanso</span>
                        <strong className="tabular text-base">{formatRest(rest)}</strong>
                      </span>
                      <button type="button" className={small} aria-label={`Mais 15 segundos de descanso em ${exercise.name}`} disabled={readOnly} onClick={() => void changeRest(view, 15)}>
                        <Plus size={14} />
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => void startRestNow(view)}
                      aria-label={`Iniciar descanso de ${exercise.name}`}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-gray-800 px-4 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      <Play size={14} /> Descansar
                    </button>
                  </div>

                  {(exercise.instructions || exercise.imageUrl || exercise.videoUrl) && (
                    <details className="mt-2 text-sm text-gray-700">
                      <summary className="flex min-h-9 cursor-pointer items-center gap-1 text-blue-700">
                        <Info size={14} /> Como fazer
                      </summary>
                      {exercise.instructions && <p className="mt-1 whitespace-pre-line">{exercise.instructions}</p>}
                      <div className="mt-2 flex flex-wrap gap-3">
                        {exercise.imageUrl && (
                          <a href={exercise.imageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-700 underline">
                            Imagem <ExternalLink size={12} />
                          </a>
                        )}
                        {exercise.videoUrl && (
                          <a href={exercise.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-700 underline">
                            Vídeo <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    </details>
                  )}

                  {/* Séries: só repetições; a carga é a do exercício */}
                  <div className="mt-3 space-y-2">
                    {Array.from({ length: setCount }, (_, i) => i + 1).map((n) => {
                      const logged = view.logs.find((l) => l.setNumber === n);
                      const reps = repsDraft[repsKey(exercise.id, n)] ?? defaultReps(view, n, logged);
                      return (
                        <div key={n} className={`grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 ${logged ? 'pb-4' : ''}`}>
                          <span className="text-sm font-medium text-gray-700">Série {n}</span>
                          <div className="relative">
                            <label className="sr-only" htmlFor={`reps-${exercise.id}-${n}`}>Repetições da série {n}</label>
                            <input
                              id={`reps-${exercise.id}-${n}`}
                              inputMode="numeric"
                              value={reps}
                              disabled={readOnly}
                              onChange={(e) => setRepsDraft((d) => ({ ...d, [repsKey(exercise.id, n)]: e.target.value }))}
                              className="min-h-12 w-full rounded-xl border border-gray-300 px-3 pr-16 text-center text-lg font-semibold"
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">reps</span>
                            {logged && (
                              <span className="absolute -bottom-4 left-1 text-[11px] text-emerald-700">
                                feita com {logged.loadKg != null ? `${formatKg(logged.loadKg)} kg` : 'sem carga'}
                              </span>
                            )}
                          </div>
                          {logged ? (
                            <div className="flex gap-1">
                              <button
                                type="button"
                                disabled={busy || readOnly}
                                onClick={() => void completeSet(view, n, logged)}
                                aria-label={`Atualizar série ${n}`}
                                className="flex min-h-12 min-w-12 items-center justify-center rounded-xl bg-emerald-600 text-white disabled:opacity-60"
                              >
                                <Check size={20} />
                              </button>
                              <button
                                type="button"
                                disabled={busy || readOnly}
                                onClick={() => void cmds.unlogSet(session.id, exercise.id, n)}
                                aria-label={`Desfazer série ${n}`}
                                className="flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-gray-300 text-gray-600 disabled:opacity-60"
                              >
                                <Undo2 size={18} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={busy || readOnly}
                              onClick={() => void completeSet(view, n)}
                              aria-label={`Concluir série ${n}`}
                              className="min-h-12 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
                            >
                              Concluir
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => setExtraSets((s) => ({ ...s, [exercise.id]: (s[exercise.id] ?? 0) + 1 }))}
                      className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
                    >
                      <Plus size={14} /> Série extra
                    </button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ol>

      {!readOnly && (
        <div className="mt-6 grid gap-3">
          <button type="button" disabled={busy} onClick={() => void finish()} className="min-h-14 rounded-2xl bg-emerald-600 text-lg font-semibold text-white disabled:opacity-60">
            Encerrar academia ({totalLogged} séries)
          </button>
          <button type="button" disabled={busy} onClick={() => void cancel()} className="min-h-12 text-sm text-gray-500 hover:text-gray-800">
            Cancelar sessão
          </button>
        </div>
      )}

      {!readOnly && <RestTimerBar session={session} onError={setMessage} />}
    </div>
  );
}

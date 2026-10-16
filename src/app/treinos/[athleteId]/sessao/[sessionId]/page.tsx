'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ExternalLink, Info, Plus, Undo2 } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import { RestTimerBar } from '@/components/workouts/rest-timer-bar';
import { unlockAudio } from '@/lib/beep';
import {
  DEFAULT_REST_SECONDS,
  formatKg,
  formatLoad,
  formatPrescription,
  formatRest,
  type SetLog,
} from '@/modules/workouts/domain/workout.schema';
import type { SessionExerciseView } from '@/modules/workouts/application/workout.queries';

type Draft = { load: string; reps: string };

function parseNumber(value: string): number | undefined {
  const t = value.trim().replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export default function SessaoPage({ params }: { params: Promise<{ athleteId: string; sessionId: string }> }) {
  const { athleteId, sessionId } = use(params);
  const router = useRouter();
  const { workout: cmds } = useCommands();
  const { workout: queries } = useQueries();
  const { data, isLoading, error, isOffline, refetch } = useReactiveQuery(() => queries.getSessionView(sessionId), [sessionId]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
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

  const { session, athlete, day, exercises } = data;
  const readOnly = session.status !== 'in_progress';
  const key = (exerciseId: string, n: number) => `${exerciseId}:${n}`;

  const initialDraft = (view: SessionExerciseView, n: number, logged?: SetLog): Draft => {
    if (logged) return { load: logged.loadKg != null ? formatKg(logged.loadKg).replace('.', ',') : '', reps: String(logged.reps) };
    const prev = view.previous?.sets.find((s) => s.setNumber === n) ?? view.previous?.sets[view.previous.sets.length - 1];
    const load = prev?.loadKg ?? view.currentLoad?.loadKg;
    const reps = prev?.reps ?? view.exercise.repsMax ?? view.exercise.repsMin;
    return { load: load != null ? formatKg(load).replace('.', ',') : '', reps: reps != null ? String(reps) : '' };
  };

  const draftFor = (view: SessionExerciseView, n: number, logged?: SetLog): Draft =>
    drafts[key(view.exercise.id, n)] ?? initialDraft(view, n, logged);

  const setDraft = (view: SessionExerciseView, n: number, patch: Partial<Draft>, logged?: SetLog) =>
    setDrafts((d) => ({ ...d, [key(view.exercise.id, n)]: { ...draftFor(view, n, logged), ...patch } }));

  const completeSet = async (view: SessionExerciseView, n: number, logged?: SetLog) => {
    unlockAudio(); // o toque libera o áudio no iPhone para o aviso do descanso
    const draft = draftFor(view, n, logged);
    const load = parseNumber(draft.load);
    const reps = parseNumber(draft.reps);
    if (reps === undefined || Number.isNaN(reps) || Number.isNaN(load)) {
      setMessage('Informe as repetições e uma carga válida (ou deixe a carga vazia).');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const rest = view.exercise.restSeconds ?? DEFAULT_REST_SECONDS;
      // Corrigir uma série já registrada não reinicia o descanso.
      await cmds.completeSet(session.id, { exerciseId: view.exercise.id, setNumber: n, loadKg: load, reps }, logged ? undefined : rest);
      setDrafts((d) => {
        const copy = { ...d };
        delete copy[key(view.exercise.id, n)];
        return copy;
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível registrar a série.');
    } finally {
      setBusy(false);
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
    if (!window.confirm('Cancelar este treino? As séries registradas não entram na evolução.')) return;
    setBusy(true);
    try {
      await cmds.cancelSession(session.id);
      router.push(`/treinos/${athleteId}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível cancelar.');
      setBusy(false);
    }
  };

  const totalLogged = exercises.reduce((n, e) => n + e.logs.length, 0);
  const input = 'min-h-12 w-full rounded-xl border border-gray-300 px-2 text-center text-lg';

  return (
    <div className="mx-auto max-w-2xl p-4 pb-44 md:p-8 md:pb-44">
      <Link href={`/treinos/${athleteId}`} className="text-sm text-blue-600 hover:underline">← {athlete.name}</Link>
      <h1 className="mt-2 text-3xl font-bold text-gray-900">
        Treino {day.code} <span className="text-lg font-normal text-gray-500">· {athlete.name}</span>
      </h1>
      {readOnly && <p className="mt-2 text-sm text-gray-500">Este treino já foi encerrado.</p>}
      {message && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</p>}

      <ol className="mt-5 space-y-4">
        {exercises.map((view) => {
          const { exercise } = view;
          const setCount = Math.max(exercise.sets, ...view.logs.map((l) => l.setNumber)) + (extraSets[exercise.id] ?? 0);
          const done = view.logs.length >= exercise.sets;
          return (
            <li key={exercise.id} className={`rounded-3xl border bg-white p-4 ${done ? 'border-emerald-300' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-900">{exercise.name}</h2>
                  <p className="text-sm text-gray-600">
                    {formatPrescription(exercise)} · descanso {exercise.restSeconds != null ? formatRest(exercise.restSeconds) : formatRest(DEFAULT_REST_SECONDS)}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-gray-500">carga atual {formatLoad(view.currentLoad)}</span>
              </div>

              {view.previous && (
                <p className="mt-1 text-xs text-gray-500">
                  Última vez ({view.previous.date.split('-').reverse().slice(0, 2).join('/')}):{' '}
                  {view.previous.sets.map((s) => `${s.loadKg != null ? `${formatKg(s.loadKg)} kg` : '—'} × ${s.reps}`).join(' · ')}
                </p>
              )}

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

              <div className="mt-3 space-y-2">
                {Array.from({ length: setCount }, (_, i) => i + 1).map((n) => {
                  const logged = view.logs.find((l) => l.setNumber === n);
                  const draft = draftFor(view, n, logged);
                  return (
                    <div key={n} className="grid grid-cols-[2rem_1fr_1fr_auto] items-center gap-2">
                      <span className="text-center text-sm text-gray-500">{n}</span>
                      <label className="sr-only" htmlFor={`load-${exercise.id}-${n}`}>Carga da série {n} (kg)</label>
                      <input
                        id={`load-${exercise.id}-${n}`}
                        inputMode="decimal"
                        placeholder="kg"
                        value={draft.load}
                        disabled={readOnly}
                        onChange={(e) => setDraft(view, n, { load: e.target.value }, logged)}
                        className={input}
                      />
                      <label className="sr-only" htmlFor={`reps-${exercise.id}-${n}`}>Repetições da série {n}</label>
                      <input
                        id={`reps-${exercise.id}-${n}`}
                        inputMode="numeric"
                        placeholder="reps"
                        value={draft.reps}
                        disabled={readOnly}
                        onChange={(e) => setDraft(view, n, { reps: e.target.value }, logged)}
                        className={input}
                      />
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
            </li>
          );
        })}
      </ol>

      {!readOnly && (
        <div className="mt-6 grid gap-3">
          <button type="button" disabled={busy} onClick={() => void finish()} className="min-h-14 rounded-2xl bg-emerald-600 text-lg font-semibold text-white disabled:opacity-60">
            Concluir treino ({totalLogged} séries)
          </button>
          <button type="button" disabled={busy} onClick={() => void cancel()} className="min-h-12 text-sm text-gray-500 hover:text-gray-800">
            Cancelar treino
          </button>
        </div>
      )}

      {!readOnly && <RestTimerBar session={session} onError={setMessage} />}
    </div>
  );
}

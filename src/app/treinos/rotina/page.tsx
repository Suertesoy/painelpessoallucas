'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { useWorkspace } from '@/providers/auth.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import {
  formatLoad,
  formatPrescription,
  formatRest,
  type ExerciseLoad,
  type WorkoutAthlete,
  type WorkoutExercise,
} from '@/modules/workouts/domain/workout.schema';
import type { RoutineView } from '@/modules/workouts/application/workout.queries';

type Editing = { dayId: string; exercise?: WorkoutExercise } | null;

export default function RotinaPage() {
  const { workout: queries } = useQueries();
  const { workout: cmds } = useCommands();
  const { data, isLoading, error, isOffline, refetch } = useReactiveQuery(() => queries.getRoutine(), []);
  const [editing, setEditing] = useState<Editing>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <DataErrorNotice isOffline={isOffline} onRetry={refetch} />
      </div>
    );
  }
  if (isLoading && !data) return <div className="p-4 text-sm text-gray-500 md:p-8">Carregando rotina…</div>;
  if (!data) return null;

  const run = async (fn: () => Promise<unknown>) => {
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível concluir a ação.');
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <Link href="/treinos" className="text-sm text-blue-600 hover:underline">← Treinos</Link>
      <h1 className="mt-2 text-3xl font-bold text-gray-900">Rotina</h1>
      <p className="mt-1 text-sm text-gray-500">
        A rotina é compartilhada; as cargas são de cada pessoa. Exercícios removidos saem da rotina mas o histórico fica.
      </p>
      {message && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</p>}

      {data.days.map(({ day, exercises, hidden }) => (
        <section key={day.id} className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1 text-xl font-semibold text-gray-900">
              Treino {day.code}{day.title ? <span className="text-base font-normal text-gray-500"> · {day.title}</span> : null}
              <button
                type="button"
                aria-label={`Renomear treino ${day.code}`}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100"
                onClick={() => {
                  const title = window.prompt(`Nome do treino ${day.code} (opcional)`, day.title ?? '');
                  if (title !== null) void run(() => cmds.renameDay(day.id, title));
                }}
              >
                <Pencil size={14} />
              </button>
            </h2>
            <button type="button" onClick={() => setEditing({ dayId: day.id })} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800">
              <Plus size={16} /> Exercício
            </button>
          </div>

          {editing && editing.dayId === day.id && !editing.exercise && (
            <ExerciseForm dayId={day.id} athletes={data.athletes} loads={data.loads} onDone={() => setEditing(null)} />
          )}

          {exercises.length === 0 && !editing && <p className="mt-2 text-sm text-gray-500">Sem exercícios.</p>}
          <ol className="mt-2 space-y-2">
            {exercises.map((ex, i) => (
              <li key={ex.id} className="rounded-2xl border border-gray-200 bg-white p-3">
                {editing?.exercise?.id === ex.id ? (
                  <ExerciseForm dayId={day.id} exercise={ex} athletes={data.athletes} loads={data.loads} onDone={() => setEditing(null)} />
                ) : (
                  <ExerciseRow
                    ex={ex}
                    data={data}
                    canUp={i > 0}
                    canDown={i < exercises.length - 1}
                    onMove={(d) => void run(() => cmds.moveExercise(ex.id, d))}
                    onEdit={() => setEditing({ dayId: day.id, exercise: ex })}
                    onHide={() => void run(() => cmds.hideExercise(ex.id))}
                    onRemove={() => {
                      if (window.confirm(`Remover “${ex.name}” da rotina? O histórico é mantido.`)) void run(() => cmds.removeExercise(ex.id));
                    }}
                    onConfirm={() => void run(() => cmds.confirmExerciseReview(ex.id))}
                  />
                )}
              </li>
            ))}
          </ol>

          {hidden.length > 0 && (
            <details className="mt-3 rounded-2xl border border-dashed border-gray-300 p-3">
              <summary className="min-h-9 cursor-pointer text-sm text-gray-600">
                Ocultos ({hidden.length}) — fora do treino, histórico preservado
              </summary>
              <ul className="mt-2 space-y-2">
                {hidden.map((ex) => (
                  <li key={ex.id} className="flex items-center justify-between gap-2 text-sm text-gray-700">
                    <span>{ex.name} <span className="text-xs text-gray-500">· {formatPrescription(ex)}</span></span>
                    <span className="flex shrink-0">
                      <button type="button" aria-label={`Reexibir ${ex.name}`} onClick={() => void run(() => cmds.unhideExercise(ex.id))} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-blue-700 hover:bg-gray-100">
                        <Eye size={16} /> Reexibir
                      </button>
                      <button type="button" aria-label={`Remover ${ex.name}`} onClick={() => { if (window.confirm(`Remover “${ex.name}” da rotina? O histórico é mantido.`)) void run(() => cmds.removeExercise(ex.id)); }} className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100">
                        <Trash2 size={16} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      ))}
    </div>
  );
}

function ExerciseRow(props: {
  ex: WorkoutExercise;
  data: RoutineView;
  canUp: boolean;
  canDown: boolean;
  onMove: (d: 'up' | 'down') => void;
  onEdit: () => void;
  onHide: () => void;
  onRemove: () => void;
  onConfirm: () => void;
}) {
  const { ex, data } = props;
  const icon = 'flex h-11 w-11 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 disabled:opacity-30';
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900">{ex.name}</p>
          <p className="text-sm text-gray-600">
            {formatPrescription(ex)} · {ex.restSeconds != null ? formatRest(ex.restSeconds) : 'sem descanso'}
            {ex.restNote && ex.restNote !== String(ex.restSeconds) ? ` (planilha: ${ex.restNote})` : ''}
          </p>
          <p className="text-xs text-gray-500">
            {data.athletes.map((a) => `${a.name}: ${formatLoad(data.loads.find((l) => l.exerciseId === ex.id && l.athleteId === a.id))}`).join(' · ')}
          </p>
        </div>
        <div className="flex shrink-0">
          <button type="button" className={icon} aria-label={`Subir ${ex.name}`} disabled={!props.canUp} onClick={() => props.onMove('up')}><ArrowUp size={16} /></button>
          <button type="button" className={icon} aria-label={`Descer ${ex.name}`} disabled={!props.canDown} onClick={() => props.onMove('down')}><ArrowDown size={16} /></button>
          <button type="button" className={icon} aria-label={`Editar ${ex.name}`} onClick={props.onEdit}><Pencil size={16} /></button>
          <button type="button" className={icon} aria-label={`Ocultar ${ex.name}`} title="Ocultar (reversível)" onClick={props.onHide}><EyeOff size={16} /></button>
          <button type="button" className={icon} aria-label={`Remover ${ex.name}`} onClick={props.onRemove}><Trash2 size={16} /></button>
        </div>
      </div>
      {ex.needsReview && (
        <div className="mt-2 rounded-xl bg-amber-50 p-2 text-xs text-amber-900">
          <p className="flex items-center gap-1 font-medium"><AlertTriangle size={14} /> A confirmar</p>
          {ex.sourceNote && <p className="mt-1">{ex.sourceNote}</p>}
          <button type="button" onClick={props.onConfirm} className="mt-1 min-h-9 font-medium underline">
            Está certo, confirmar
          </button>
        </div>
      )}
    </>
  );
}

function ExerciseForm({
  dayId,
  exercise,
  athletes,
  loads,
  onDone,
}: {
  dayId: string;
  exercise?: WorkoutExercise;
  athletes: WorkoutAthlete[];
  loads: ExerciseLoad[];
  onDone: () => void;
}) {
  const { workspaceId } = useWorkspace();
  const { workout: cmds } = useCommands();
  const [name, setName] = useState(exercise?.name ?? '');
  const [sets, setSets] = useState(String(exercise?.sets ?? 3));
  const [repsMin, setRepsMin] = useState(exercise?.repsMin != null ? String(exercise.repsMin) : '');
  const [repsMax, setRepsMax] = useState(exercise?.repsMax != null ? String(exercise.repsMax) : '');
  const [repsNote, setRepsNote] = useState(exercise?.repsNote ?? '');
  const [rest, setRest] = useState(exercise?.restSeconds != null ? String(exercise.restSeconds) : '');
  const [instructions, setInstructions] = useState(exercise?.instructions ?? '');
  const [imageUrl, setImageUrl] = useState(exercise?.imageUrl ?? '');
  const [videoUrl, setVideoUrl] = useState(exercise?.videoUrl ?? '');
  const [athleteLoads, setAthleteLoads] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      athletes.map((a) => {
        const l = loads.find((x) => x.exerciseId === exercise?.id && x.athleteId === a.id);
        return [a.id, l?.loadKg != null ? String(l.loadKg).replace('.', ',') : ''];
      })
    )
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const num = (v: string) => (v.trim() ? Number(v.replace(',', '.')) : undefined);
  const text = (v: string) => (v.trim() ? v.trim() : undefined);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await cmds.saveExercise(workspaceId, {
        id: exercise?.id,
        dayId,
        name,
        sets: Number(sets),
        repsMin: num(repsMin),
        repsMax: num(repsMax),
        repsNote: text(repsNote),
        restSeconds: num(rest),
        restNote: exercise?.restNote,
        instructions: text(instructions),
        imageUrl: text(imageUrl),
        videoUrl: text(videoUrl),
      });
      for (const a of athletes) {
        const raw = athleteLoads[a.id] ?? '';
        const current = loads.find((x) => x.exerciseId === saved.id && x.athleteId === a.id);
        const next = num(raw);
        if (next !== current?.loadKg && !(next === undefined && current?.loadKg === undefined)) {
          await cmds.setAthleteLoad(workspaceId, { exerciseId: saved.id, athleteId: a.id, loadKg: next });
        }
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o exercício.');
    } finally {
      setBusy(false);
    }
  };

  const field = 'min-h-11 w-full rounded-xl border border-gray-300 px-3';
  const label = 'block text-xs font-medium text-gray-600';

  return (
    <form
      className="mt-2 space-y-3 rounded-2xl border border-blue-200 bg-blue-50/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div>
        <label className={label} htmlFor="ex-name">Nome do exercício</label>
        <input id="ex-name" className={field} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><label className={label} htmlFor="ex-sets">Séries</label><input id="ex-sets" inputMode="numeric" className={field} value={sets} onChange={(e) => setSets(e.target.value)} /></div>
        <div><label className={label} htmlFor="ex-rmin">Reps mín.</label><input id="ex-rmin" inputMode="numeric" className={field} value={repsMin} onChange={(e) => setRepsMin(e.target.value)} /></div>
        <div><label className={label} htmlFor="ex-rmax">Reps máx.</label><input id="ex-rmax" inputMode="numeric" className={field} value={repsMax} onChange={(e) => setRepsMax(e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={label} htmlFor="ex-note">Observação das reps</label><input id="ex-note" className={field} value={repsNote} onChange={(e) => setRepsNote(e.target.value)} placeholder="cada perna…" /></div>
        <div><label className={label} htmlFor="ex-rest">Descanso (segundos)</label><input id="ex-rest" inputMode="numeric" className={field} value={rest} onChange={(e) => setRest(e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {athletes.map((a) => (
          <div key={a.id}>
            <label className={label} htmlFor={`ex-load-${a.id}`}>Carga de {a.name} (kg)</label>
            <input id={`ex-load-${a.id}`} inputMode="decimal" className={field} value={athleteLoads[a.id] ?? ''} onChange={(e) => setAthleteLoads((s) => ({ ...s, [a.id]: e.target.value }))} />
          </div>
        ))}
      </div>
      <div><label className={label} htmlFor="ex-inst">Como executar (instruções curtas)</label><textarea id="ex-inst" rows={2} className={`${field} py-2`} value={instructions} onChange={(e) => setInstructions(e.target.value)} /></div>
      <div><label className={label} htmlFor="ex-img">Link de imagem</label><input id="ex-img" inputMode="url" className={field} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" /></div>
      <div><label className={label} htmlFor="ex-vid">Link de vídeo</label><input id="ex-vid" inputMode="url" className={field} value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://…" /></div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="min-h-12 flex-1 rounded-xl bg-blue-600 font-semibold text-white disabled:opacity-60">Salvar</button>
        <button type="button" onClick={onDone} className="min-h-12 rounded-xl border border-gray-300 bg-white px-4 text-gray-700">Cancelar</button>
      </div>
    </form>
  );
}

'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Play } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { useWorkspace } from '@/providers/auth.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import { AthleteSwitch } from '@/components/workouts/athlete-switch';
import { LoadField } from '@/components/workouts/load-field';
import { SessionClock } from '@/components/workouts/session-clock';
import { DEFAULT_REST_SECONDS, formatKg, formatPrescription, formatRest } from '@/modules/workouts/domain/workout.schema';

/**
 * Consultar um treino (A–E) com calma, sem iniciar nada: dá para abrir o A,
 * olhar o B, voltar. Só "Começar treino" entra no fluxo ativo. O seletor
 * Lucas | Matheus mostra e permite ajustar as cargas de cada um.
 */
export default function DiaPage({ params }: { params: Promise<{ athleteId: string; dayId: string }> }) {
  const { athleteId, dayId } = use(params);
  const { workspaceId } = useWorkspace();
  const router = useRouter();
  const { workout: cmds } = useCommands();
  const { workout: queries } = useQueries();
  const { data, isLoading, error, isOffline, refetch } = useReactiveQuery(() => queries.getDayPreview(athleteId, dayId), [athleteId, dayId]);
  const [viewId, setViewId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <DataErrorNotice isOffline={isOffline} onRetry={refetch} />
      </div>
    );
  }
  if (isLoading && !data) return <div className="p-4 text-sm text-gray-500 md:p-8">Carregando…</div>;
  if (!data) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <p role="alert" className="text-sm text-gray-600">Treino não encontrado.</p>
        <Link href={`/treinos/${athleteId}`} className="text-sm text-blue-600 hover:underline">← Voltar</Link>
      </div>
    );
  }

  const { athlete, athletes, day, exercises, activeSession, activeDay } = data;
  const currentView = viewId ?? athlete.id;
  const viewed = athletes.find((a) => a.id === currentView) ?? athlete;
  const inFocus = activeSession?.dayId === day.id;

  /** Sem sessão: começa a academia (cronômetro) já neste treino. Com sessão: só muda o foco — nada é encerrado. */
  const start = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const session = activeSession
        ? await cmds.focusDay(activeSession.id, day.id)
        : await cmds.startGeneralSession(workspaceId, athlete.id, day.id);
      router.push(`/treinos/${athlete.id}/sessao/${session.id}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível começar o treino.');
      setBusy(false);
    }
  };

  const saveLoad = async (exerciseId: string, kg: number | undefined) => {
    setMessage(null);
    try {
      await cmds.setAthleteLoad(workspaceId, { exerciseId, athleteId: viewed.id, loadKg: kg });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível salvar a carga.');
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-4 pb-32 md:p-8">
      <Link href={`/treinos/${athleteId}`} className="text-sm text-blue-600 hover:underline">← {athlete.name}</Link>
      <h1 className="mt-2 text-3xl font-bold text-gray-900">
        Treino {day.code}
        {day.title && <span className="text-lg font-normal text-gray-500"> · {day.title}</span>}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        {exercises.length} {exercises.length === 1 ? 'exercício' : 'exercícios'} · {activeSession ? 'consulta (a academia segue contando)' : 'só consulta, nada começou ainda'}
      </p>
      {activeSession && (
        <div className="mt-2">
          <SessionClock startedAt={activeSession.startedAt} />
        </div>
      )}

      <div className="mt-4">
        <AthleteSwitch athletes={athletes} value={currentView} ownId={athlete.id} onChange={setViewId} />
        <p className="mt-1 text-xs text-gray-500">Cargas de <strong>{viewed.name}</strong>. Você pode ajustar aqui mesmo.</p>
      </div>

      {message && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</p>}

      <ol className="mt-5 space-y-4">
        {exercises.map(({ exercise, loadsByAthlete, previousByAthlete }) => {
          const load = loadsByAthlete[viewed.id];
          const prev = previousByAthlete[viewed.id];
          return (
            <li key={exercise.id} className="rounded-3xl border border-gray-200 bg-white p-4">
              <h2 className="font-semibold text-gray-900">{exercise.name}</h2>
              <p className="mt-0.5 text-sm text-gray-600">
                {formatPrescription(exercise)} · descanso {formatRest(exercise.restSeconds ?? DEFAULT_REST_SECONDS)}
              </p>
              <div className="mt-3">
                <LoadField
                  key={`${exercise.id}:${viewed.id}:${load?.loadKg ?? ''}`}
                  initial={load?.loadKg}
                  onCommit={(kg) => {
                    if (kg !== load?.loadKg) void saveLoad(exercise.id, kg);
                  }}
                />
                {load?.loadKg == null && load?.loadNote && (
                  <p className="mt-1 text-xs text-amber-700">Anotado na planilha: “{load.loadNote}”</p>
                )}
              </div>
              {prev && (
                <p className="mt-2 text-xs text-gray-500">
                  Última vez ({prev.date.split('-').reverse().slice(0, 2).join('/')}):{' '}
                  {prev.sets[0]?.loadKg != null ? `${formatKg(prev.sets[0].loadKg)} kg · ` : ''}
                  {prev.sets.map((s) => s.reps).join(', ')} reps
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto max-w-2xl">
          {inFocus && activeSession ? (
            <Link
              href={`/treinos/${athleteId}/sessao/${activeSession.id}`}
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-blue-600 text-lg font-semibold text-white"
            >
              <Play size={20} /> Continuar treino {day.code}
            </Link>
          ) : (
            <button
              type="button"
              disabled={busy || exercises.length === 0}
              onClick={() => void start()}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 text-lg font-semibold text-white disabled:opacity-60"
            >
              <Play size={20} /> {activeSession ? `Executar treino ${day.code}` : `Começar treino ${day.code}`}
            </button>
          )}
          {activeSession && activeDay && activeDay.id !== day.id && (
            <Link href={`/treinos/${athleteId}/sessao/${activeSession.id}`} className="mt-1 flex min-h-11 items-center justify-center text-sm text-blue-700">
              Voltar ao treino {activeDay.code}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

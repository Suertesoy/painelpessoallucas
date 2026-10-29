'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ChevronRight, History as HistoryIcon, LineChart as ChartIcon, Play } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { useWorkspace } from '@/providers/auth.provider';
import { SessionClock } from '@/components/workouts/session-clock';
import { DataErrorNotice } from '@/components/data-error-notice';
import { WorkoutPushToggle } from '@/components/workouts/workout-push-toggle';

/**
 * Escolher o treino: cada dia (A–E) abre uma tela de consulta — dá para olhar
 * o A, o B, voltar, sem iniciar nada e sem cancelar nada. Só "Começar treino",
 * dentro do dia, entra no fluxo ativo.
 */
/** 2026-10-16 → 16/10/2026 (sem passar por Date UTC). */
function formatDate(day: string): string {
  return format(parseISO(`${day}T00:00:00`), 'dd/MM/yyyy');
}

export default function AtletaPage({ params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = use(params);
  const { workout: queries } = useQueries();
  const { workout: cmds } = useCommands();
  const { workspaceId } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { data, isLoading, error, isOffline, refetch } = useReactiveQuery(() => queries.getAthleteOverview(athleteId), [athleteId]);

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
        <p role="alert" className="text-sm text-gray-600">Pessoa não encontrada.</p>
        <Link href="/treinos" className="text-sm text-blue-600 hover:underline">← Treinos</Link>
      </div>
    );
  }

  const active = data.activeSession;
  const activeCode = active ? data.days.find((d) => d.day.id === active.dayId)?.day.code : undefined;

  const startGym = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await cmds.startGeneralSession(workspaceId, athleteId);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível iniciar a academia.');
    } finally {
      setBusy(false);
    }
  };

  const endGym = async () => {
    if (!active) return;
    if (!window.confirm('Encerrar a academia de hoje? As séries registradas ficam salvas.')) return;
    setBusy(true);
    try {
      await cmds.finishSession(active.id);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível encerrar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <Link href="/treinos" className="text-sm text-blue-600 hover:underline">← Treinos</Link>
      <h1 className="mt-2 text-3xl font-bold text-gray-900">{data.athlete.name}</h1>
      <p className="mt-1 text-sm text-gray-500">Abra qualquer treino para consultar os exercícios e as cargas.</p>

      {message && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</p>}

      {active ? (
        <section aria-label="Academia em andamento" className="mt-5 rounded-3xl border border-blue-300 bg-blue-50 p-4">
          <SessionClock startedAt={active.startedAt} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/treinos/${athleteId}/sessao/${active.id}`}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 font-semibold text-white"
            >
              Ir para o treino {activeCode} <Play size={16} />
            </Link>
            <button
              type="button"
              disabled={busy}
              onClick={() => void endGym()}
              className="min-h-12 rounded-2xl border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 disabled:opacity-60"
            >
              Encerrar academia
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">O cronômetro segue contando enquanto você consulta ou troca de treino. Só “Encerrar” o para.</p>
        </section>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void startGym()}
          className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 text-lg font-semibold text-white disabled:opacity-60"
        >
          <Play size={20} /> Iniciar academia (cronômetro)
        </button>
      )}

      <div className="mt-5">
        <WorkoutPushToggle athleteId={athleteId} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3">
        {data.days.map(({ day, exerciseCount, lastDoneOn, loggedInActive, completedCount, lastCompletedOn, legacyCompletedCount }) => (
          <Link
            key={day.id}
            href={`/treinos/${athleteId}/dia/${day.id}`}
            className="flex min-h-20 items-center gap-4 rounded-3xl border border-gray-200 bg-white p-4 text-left shadow-[0_12px_28px_-16px_rgba(0,0,0,0.7)] transition hover:bg-gray-50 active:scale-[0.99]"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-3xl font-bold text-blue-700">
              {day.code}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-gray-900">
                Treino {day.code}
                {day.title && <span className="font-normal text-gray-500"> · {day.title}</span>}
                {loggedInActive > 0 && <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">{loggedInActive} séries hoje</span>}
              </span>
              <span className="block text-xs text-gray-500">
                {exerciseCount} {exerciseCount === 1 ? 'exercício' : 'exercícios'}
                {exerciseCount === 0 && ' · monte a rotina'}
              </span>
              {exerciseCount > 0 && (
                <span className="block text-xs text-gray-600">
                  {lastDoneOn ? `Última execução: ${formatDate(lastDoneOn)}` : 'Ainda não executado'}
                  {' · '}
                  {completedCount > 0 ? (
                    <strong className="font-semibold text-gray-900" title="Vezes que este treino foi concluído">
                      {completedCount}×<span className="sr-only"> concluído</span>
                    </strong>
                  ) : (
                    <span>ainda não concluído</span>
                  )}
                  {!!legacyCompletedCount && (
                    <span className="block text-gray-500" title="Estimativa das sessões anteriores ao botão Concluir Treino">
                      +{legacyCompletedCount} anterior{legacyCompletedCount === 1 ? '' : 'es'} (estimado)
                    </span>
                  )}
                  {lastCompletedOn && lastCompletedOn !== lastDoneOn && <span className="block">Última conclusão: {formatDate(lastCompletedOn)}</span>}
                </span>
              )}
            </span>
            <ChevronRight size={18} className="shrink-0 text-gray-400" />
          </Link>
        ))}
      </div>

      <Link
        href={`/treinos/${athleteId}/historico`}
        className="mt-6 flex min-h-14 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 hover:bg-gray-50"
      >
        <HistoryIcon size={18} aria-hidden="true" /> Histórico de treinos
      </Link>
      <Link
        href={`/treinos/${athleteId}/evolucao`}
        className="mt-3 flex min-h-14 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 hover:bg-gray-50"
      >
        <ChartIcon size={18} aria-hidden="true" /> Evolução e peso corporal
      </Link>
    </div>
  );
}

'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { LineChart as ChartIcon, Play } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { useWorkspace } from '@/providers/auth.provider';
import { DataErrorNotice } from '@/components/data-error-notice';

export default function AtletaPage({ params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = use(params);
  const { workspaceId } = useWorkspace();
  const router = useRouter();
  const { workout: cmds } = useCommands();
  const { workout: queries } = useQueries();
  const { data, isLoading, error, isOffline, refetch } = useReactiveQuery(() => queries.getAthleteOverview(athleteId), [athleteId]);
  const [busyDay, setBusyDay] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  const start = async (dayId: string) => {
    setBusyDay(dayId);
    setActionError(null);
    try {
      const session = await cmds.startSession(workspaceId, athleteId, dayId);
      router.push(`/treinos/${athleteId}/sessao/${session.id}`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Não foi possível iniciar o treino.');
    } finally {
      setBusyDay(null);
    }
  };

  const active = data.activeSession;

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <Link href="/treinos" className="text-sm text-blue-600 hover:underline">← Treinos</Link>
      <h1 className="mt-2 text-3xl font-bold text-gray-900">{data.athlete.name}</h1>
      <p className="mt-1 text-sm text-gray-500">Qual treino hoje?</p>

      {active && (
        <Link
          href={`/treinos/${athleteId}/sessao/${active.id}`}
          className="mt-5 flex min-h-14 items-center justify-between rounded-2xl bg-blue-600 px-5 font-semibold text-white"
        >
          Continuar treino em andamento <Play size={18} />
        </Link>
      )}
      {actionError && <p role="alert" className="mt-3 text-sm text-red-600">{actionError}</p>}

      <div className="mt-5 grid grid-cols-1 gap-3">
        {data.days.map(({ day, exerciseCount, lastDoneOn }) => (
          <button
            key={day.id}
            type="button"
            disabled={!!active || exerciseCount === 0 || busyDay !== null}
            onClick={() => void start(day.id)}
            className="flex min-h-20 items-center gap-4 rounded-3xl border border-gray-200 bg-white p-4 text-left shadow-[0_12px_28px_-16px_rgba(0,0,0,0.7)] transition hover:bg-gray-50 active:scale-[0.99] disabled:opacity-50"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-3xl font-bold text-blue-700">
              {day.code}
            </span>
            <span>
              <span className="block font-semibold text-gray-900">
                Treino {day.code} · {exerciseCount} {exerciseCount === 1 ? 'exercício' : 'exercícios'}
              </span>
              <span className="block text-xs text-gray-500">
                {exerciseCount === 0
                  ? 'Sem exercícios — monte a rotina'
                  : lastDoneOn
                    ? `Último: ${format(parseISO(`${lastDoneOn}T00:00:00`), "d 'de' MMM", { locale: ptBR })}`
                    : 'Ainda não feito'}
              </span>
            </span>
          </button>
        ))}
      </div>

      <Link
        href={`/treinos/${athleteId}/evolucao`}
        className="mt-6 flex min-h-14 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 hover:bg-gray-50"
      >
        <ChartIcon size={18} aria-hidden="true" /> Evolução e peso corporal
      </Link>
    </div>
  );
}

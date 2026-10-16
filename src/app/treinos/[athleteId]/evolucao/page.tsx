'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { useWorkspace } from '@/providers/auth.provider';
import { todayDateStr } from '@/lib/dates';
import { DataErrorNotice } from '@/components/data-error-notice';
import { LineChart } from '@/components/workouts/line-chart';
import { summarizeBodyWeight } from '@/modules/workouts/domain/workout-stats';
import { formatKg } from '@/modules/workouts/domain/workout.schema';

const shortDate = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');

export default function EvolucaoPage({ params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = use(params);
  const { workspaceId } = useWorkspace();
  const { workout: cmds } = useCommands();
  const { workout: queries } = useQueries();
  const { data, isLoading, error, isOffline, refetch } = useReactiveQuery(() => queries.getEvolution(athleteId), [athleteId]);
  const [weight, setWeight] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <DataErrorNotice isOffline={isOffline} onRetry={refetch} />
      </div>
    );
  }
  if (isLoading && !data) return <div className="p-4 text-sm text-gray-500 md:p-8">Carregando…</div>;
  if (!data) return <div className="p-4 text-sm text-gray-600">Pessoa não encontrada.</div>;

  const summary = summarizeBodyWeight(data.bodyWeights);

  const saveWeight = async () => {
    const value = Number(weight.replace(',', '.'));
    setMsg(null);
    try {
      await cmds.logBodyWeight(workspaceId, { athleteId, weightKg: value, loggedOn: todayDateStr() });
      setWeight('');
      setMsg('Peso registrado.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Não foi possível registrar o peso.');
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <Link href={`/treinos/${athleteId}`} className="text-sm text-blue-600 hover:underline">← {data.athlete.name}</Link>
      <h1 className="mt-2 text-3xl font-bold text-gray-900">Evolução</h1>

      <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-4">
        <h2 className="font-semibold text-gray-900">Peso corporal</h2>
        <p className="text-sm text-gray-500">
          {summary.latest
            ? `${formatKg(summary.latest.weightKg)} kg em ${shortDate(summary.latest.loggedOn)}${summary.deltaKg != null ? ` · ${summary.deltaKg > 0 ? '+' : ''}${formatKg(summary.deltaKg)} kg desde o primeiro registro` : ''}`
            : 'Registre o peso de tempos em tempos para acompanhar.'}
        </p>
        <div className="mt-2">
          <LineChart
            title={`Peso corporal de ${data.athlete.name}`}
            unit="kg"
            points={data.bodyWeights.map((b) => ({ label: shortDate(b.loggedOn), value: b.weightKg }))}
          />
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void saveWeight();
          }}
        >
          <input
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            aria-label="Peso de hoje em kg"
            placeholder="Peso de hoje (kg)"
            className="min-h-12 flex-1 rounded-xl border border-gray-300 px-3"
          />
          <button type="submit" disabled={!weight.trim()} className="min-h-12 rounded-xl bg-blue-600 px-5 font-semibold text-white disabled:opacity-50">
            Registrar
          </button>
        </form>
        {msg && <p role="status" className="mt-2 text-sm text-gray-600">{msg}</p>}
        {data.bodyWeights.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-gray-600">
            {[...data.bodyWeights].reverse().slice(0, 5).map((b) => (
              <li key={b.id} className="flex items-center justify-between">
                <span>{shortDate(b.loggedOn)} · {formatKg(b.weightKg)} kg</span>
                <button type="button" aria-label={`Remover registro de ${shortDate(b.loggedOn)}`} onClick={() => void cmds.deleteBodyWeight(b.id)} className="flex h-10 w-10 items-center justify-center text-gray-400 hover:text-red-600">
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2 className="mt-8 text-lg font-semibold text-gray-900">Cargas por exercício</h2>
      {data.exercises.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">Conclua séries em um treino para ver os gráficos aqui.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {data.exercises.map(({ exercise, dayCode, points }) => {
            const withLoad = points.filter((p) => p.topLoadKg != null);
            const last = points[points.length - 1];
            return (
              <li key={exercise.id} className="rounded-3xl border border-gray-200 bg-white p-4">
                <p className="font-semibold text-gray-900">
                  {exercise.name} <span className="text-xs font-normal text-gray-500">· treino {dayCode}</span>
                </p>
                <p className="text-xs text-gray-500">
                  Última: {last.topLoadKg != null ? `${formatKg(last.topLoadKg)} kg × ${last.repsAtTop}` : `${last.repsAtTop} reps`} · {points.length} treinos
                </p>
                {withLoad.length > 0 ? (
                  <LineChart
                    title={`Carga máxima em ${exercise.name}`}
                    unit="kg"
                    points={withLoad.map((p) => ({ label: shortDate(p.date), value: p.topLoadKg as number }))}
                  />
                ) : (
                  <p className="mt-2 text-sm text-gray-500">Sem carga registrada (só repetições).</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

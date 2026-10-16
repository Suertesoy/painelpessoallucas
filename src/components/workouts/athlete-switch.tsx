'use client';

import type { WorkoutAthlete } from '@/modules/workouts/domain/workout.schema';

/**
 * Seletor segmentado Lucas | Matheus. Dentro do treino serve para treinar
 * junto: continua-se no treino de um, mas dá para consultar e ajustar as
 * cargas do outro e voltar em um toque.
 */
export function AthleteSwitch({
  athletes,
  value,
  ownId,
  onChange,
}: {
  athletes: WorkoutAthlete[];
  value: string;
  /** Pessoa dona do treino em andamento (marcada com "meu treino"). */
  ownId?: string;
  onChange: (athleteId: string) => void;
}) {
  return (
    <div role="tablist" aria-label="Ver cargas de" className="flex rounded-2xl border border-gray-200 bg-gray-100 p-1">
      {athletes.map((a) => {
        const active = a.id === value;
        return (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(a.id)}
            className={`min-h-11 flex-1 rounded-xl px-3 text-sm font-semibold transition-colors ${
              active ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {a.name}
            {ownId === a.id && <span className="ml-1 text-xs font-normal text-gray-400">(treino)</span>}
          </button>
        );
      })}
    </div>
  );
}

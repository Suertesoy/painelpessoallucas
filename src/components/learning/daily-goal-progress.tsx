'use client';

/** Barra de progresso da meta diária — nunca trava o estudo acima da meta. */
export function DailyGoalProgress({
  minutesStudied,
  goalMinutes,
  goalMet,
}: {
  minutesStudied: number;
  goalMinutes: number;
  goalMet: boolean;
}) {
  const pct = Math.min(100, Math.round((minutesStudied / goalMinutes) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">Meta diária</span>
        <span className="text-gray-500">
          {minutesStudied} de {goalMinutes} minutos
        </span>
      </div>
      <div
        className="mt-1.5 h-2.5 w-full rounded-full bg-gray-100"
        role="progressbar"
        aria-valuenow={minutesStudied}
        aria-valuemin={0}
        aria-valuemax={goalMinutes}
        aria-label="Progresso da meta diária de estudo"
      >
        <div
          className={`h-2.5 rounded-full transition-all ${goalMet ? 'bg-emerald-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {goalMet && (
        <p className="mt-1.5 text-xs font-medium text-emerald-700">Meta diária concluída</p>
      )}
    </div>
  );
}

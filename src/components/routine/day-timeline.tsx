'use client';

import { Check } from 'lucide-react';
import type { RoutineBlock } from '@/modules/routine/domain/routine.schema';

export interface DayTimelineProps {
  mounted: boolean;
  isBusinessDay: boolean;
  blocks: RoutineBlock[];
  nowTime: string | null;
  currentBlockId: string | null;
  roleProjectNames: Partial<Record<'deep_work_primary' | 'deep_work_secondary', string>>;
  learningGoalMet: boolean;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Linha do tempo compacta e legível — nunca uma agenda hora a hora completa. */
export function DayTimeline({
  mounted,
  isBusinessDay,
  blocks,
  nowTime,
  currentBlockId,
  roleProjectNames,
  learningGoalMet,
}: DayTimelineProps) {
  if (!isBusinessDay) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-500">Seu dia</h3>
        <p className="mt-2 text-sm text-gray-400">Sem rotina de trabalho hoje.</p>
      </section>
    );
  }

  const nowMinutes = mounted && nowTime ? toMinutes(nowTime) : null;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-500">Seu dia</h3>
      <ol className="mt-3 space-y-1.5">
        {blocks.map((block) => {
          const isCurrent = mounted && block.id === currentBlockId;
          const isPast = nowMinutes !== null && toMinutes(block.endTime) <= nowMinutes && !isCurrent;
          const isDone = isPast && block.role === 'learning' && learningGoalMet;
          const projectName =
            block.role === 'deep_work_primary' || block.role === 'deep_work_secondary'
              ? roleProjectNames[block.role]
              : undefined;

          return (
            <li
              key={block.id}
              className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm ${
                isCurrent ? 'bg-blue-50 font-semibold text-blue-900' : isPast ? 'text-gray-400' : 'text-gray-700'
              }`}
            >
              <span className="w-11 shrink-0 tabular-nums">{block.startTime}</span>
              <span className="min-w-0 flex-1 truncate">
                {block.label}
                {projectName && <span className="text-gray-400"> · {projectName}</span>}
              </span>
              {isDone && <Check size={14} className="shrink-0 text-emerald-500" aria-label="concluído" />}
              {isCurrent && <span className="shrink-0 text-xs text-blue-600">← agora</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

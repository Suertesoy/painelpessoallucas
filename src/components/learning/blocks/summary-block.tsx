import { CheckCircle2, ListChecks } from 'lucide-react';
import type { LessonBlockViewProps } from './types';
import type { SummaryBlock } from '@/modules/learning/domain/lesson-content.schema';

export function SummaryBlockView({ block }: LessonBlockViewProps<SummaryBlock>) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 md:p-5">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <ListChecks size={14} /> Resumo
      </p>
      <ul className="mt-3 space-y-2">
        {block.points.map((point, index) => (
          <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-gray-400" />
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}

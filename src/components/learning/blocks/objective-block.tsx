import { Target } from 'lucide-react';
import type { LessonBlockViewProps } from './types';
import type { ObjectiveBlock } from '@/modules/learning/domain/lesson-content.schema';

export function ObjectiveBlockView({ block }: LessonBlockViewProps<ObjectiveBlock>) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <Target size={18} className="mt-0.5 shrink-0 text-blue-600" />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Objetivo</p>
        <p className="mt-1 text-sm text-blue-900">{block.text}</p>
      </div>
    </div>
  );
}

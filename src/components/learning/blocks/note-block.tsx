import { Info, Lightbulb, TriangleAlert } from 'lucide-react';
import type { LessonBlockViewProps } from './types';
import type { NoteBlock, NoteTone } from '@/modules/learning/domain/lesson-content.schema';

const TONE_STYLES: Record<NoteTone, { container: string; icon: typeof Info }> = {
  info: { container: 'border-blue-200 bg-blue-50 text-blue-900', icon: Info },
  tip: { container: 'border-green-200 bg-green-50 text-green-900', icon: Lightbulb },
  warning: { container: 'border-amber-200 bg-amber-50 text-amber-900', icon: TriangleAlert },
};

export function NoteBlockView({ block }: LessonBlockViewProps<NoteBlock>) {
  const { container, icon: Icon } = TONE_STYLES[block.tone];
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border p-4 text-sm ${container}`}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <p>{block.text}</p>
    </div>
  );
}

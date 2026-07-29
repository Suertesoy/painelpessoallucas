import type { LessonBlockViewProps } from './types';
import type { TextBlock } from '@/modules/learning/domain/lesson-content.schema';

export function TextBlockView({ block }: LessonBlockViewProps<TextBlock>) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      {block.heading && <h3 className="text-sm font-semibold text-gray-900">{block.heading}</h3>}
      <div className={block.heading ? 'mt-2 space-y-2' : 'space-y-2'}>
        {block.paragraphs.map((paragraph, index) => (
          <p key={index} className="text-sm leading-relaxed text-gray-700">
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
}

import type { LessonBlockViewProps } from './types';
import type { ExampleBlock } from '@/modules/learning/domain/lesson-content.schema';

export function ExampleBlockView({ block }: LessonBlockViewProps<ExampleBlock>) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      {block.heading && <h3 className="text-sm font-semibold text-gray-900">{block.heading}</h3>}
      <ul className={`space-y-2 ${block.heading ? 'mt-3' : ''}`}>
        {block.items.map((item, index) => (
          <li key={index} className="rounded-lg bg-gray-50 p-3">
            <p className="text-sm font-medium text-gray-900">{item.text}</p>
            {item.translation && <p className="mt-0.5 text-sm text-gray-600">{item.translation}</p>}
            {item.note && <p className="mt-0.5 text-xs text-gray-400">{item.note}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

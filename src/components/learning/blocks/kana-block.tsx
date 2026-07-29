import type { LessonBlockViewProps } from './types';
import type { KanaBlock } from '@/modules/learning/domain/lesson-content.schema';

export function KanaBlockView({ block, showRomaji = true }: LessonBlockViewProps<KanaBlock>) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      {block.heading && <h3 className="text-sm font-semibold text-gray-900">{block.heading}</h3>}
      <div className={`grid grid-cols-3 gap-3 sm:grid-cols-5 ${block.heading ? 'mt-3' : ''}`}>
        {block.characters.map((c) => (
          <div
            key={c.character}
            className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 py-3"
          >
            <span className="text-3xl font-medium text-gray-900">{c.character}</span>
            {showRomaji && <span className="text-xs text-gray-500">{c.romaji}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

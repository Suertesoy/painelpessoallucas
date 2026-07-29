'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import type { LessonBlockViewProps } from './types';
import type { MatchingBlock } from '@/modules/learning/domain/lesson-content.schema';

/**
 * Reordenação determinística (não `Math.random`, que causaria mismatch de
 * hidratação): a coluna direita é a mesma lista invertida, só para não
 * alinhar 1:1 posicionalmente com a esquerda.
 */
function shuffledRight(pairs: MatchingBlock['pairs']) {
  return [...pairs].reverse();
}

export function MatchingBlockView({ block, onExerciseResult, attempt }: LessonBlockViewProps<MatchingBlock>) {
  const resolved = attempt?.resolvedAt != null;
  const [rightItems] = useState(() => shuffledRight(block.pairs));
  // Progresso persistido de uma sessão anterior: nasce com todos os pares já
  // marcados (só sabemos o resultado agregado — sempre 'correct', matching
  // nunca reporta tentativa incorreta — não a ordem em que cada par foi
  // resolvido), sem reemitir o resultado.
  const [matchedIds, setMatchedIds] = useState<Set<string>>(() =>
    resolved ? new Set(block.pairs.map((p) => p.id)) : new Set()
  );
  const [selectedLeftId, setSelectedLeftId] = useState<string | null>(null);
  const [wrongId, setWrongId] = useState<string | null>(null);

  const allMatched = matchedIds.size === block.pairs.length;

  const handleSelectLeft = (pairId: string) => {
    if (matchedIds.has(pairId)) return;
    setSelectedLeftId(pairId);
    setWrongId(null);
  };

  const handleSelectRight = (pairId: string) => {
    if (!selectedLeftId || matchedIds.has(pairId)) return;
    if (pairId === selectedLeftId) {
      const next = new Set(matchedIds).add(pairId);
      setMatchedIds(next);
      setSelectedLeftId(null);
      if (next.size === block.pairs.length) {
        onExerciseResult?.({ blockId: block.id, outcome: 'correct' });
      }
    } else {
      setWrongId(pairId);
      setTimeout(() => setWrongId(null), 500);
      setSelectedLeftId(null);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <p className="text-sm font-medium text-gray-900">{block.prompt}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="space-y-2">
          {block.pairs.map((pair) => {
            const isMatched = matchedIds.has(pair.id);
            const isSelected = selectedLeftId === pair.id;
            return (
              <button
                key={pair.id}
                type="button"
                disabled={isMatched}
                onClick={() => handleSelectLeft(pair.id)}
                className={`w-full rounded-lg border px-3 py-2 text-center text-sm transition-colors disabled:cursor-default ${
                  isMatched
                    ? 'border-green-300 bg-green-50 text-green-800'
                    : isSelected
                      ? 'border-blue-400 bg-blue-50 text-blue-900'
                      : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
                }`}
              >
                {pair.left}
                {isMatched && <Check size={14} className="ml-1.5 inline text-green-600" />}
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          {rightItems.map((pair) => {
            const isMatched = matchedIds.has(pair.id);
            const isWrong = wrongId === pair.id;
            return (
              <button
                key={pair.id}
                type="button"
                disabled={isMatched}
                onClick={() => handleSelectRight(pair.id)}
                className={`w-full rounded-lg border px-3 py-2 text-center text-sm transition-colors disabled:cursor-default ${
                  isMatched
                    ? 'border-green-300 bg-green-50 text-green-800'
                    : isWrong
                      ? 'border-red-300 bg-red-50 text-red-800'
                      : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
                }`}
              >
                {pair.right}
              </button>
            );
          })}
        </div>
      </div>
      {allMatched && <p className="mt-3 text-xs text-green-700">Todos os pares corretos!</p>}
    </div>
  );
}

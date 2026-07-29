'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { LessonBlockViewProps } from './types';
import type { MultipleChoiceBlock } from '@/modules/learning/domain/lesson-content.schema';

export function MultipleChoiceBlockView({ block, onExerciseResult, attempt }: LessonBlockViewProps<MultipleChoiceBlock>) {
  const resolved = attempt?.resolvedAt != null;
  // Só a opção certa é reconstruída ao reabrir (dado estático do
  // conteúdo) — nunca sabemos qual opção errada foi clicada em cada
  // tentativa, só o resultado agregado.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flashWrongId, setFlashWrongId] = useState<string | null>(null);
  const [triedIncorrectly, setTriedIncorrectly] = useState(attempt != null && !resolved);

  const locked = resolved || selectedId !== null;

  const handleSelect = (optionId: string) => {
    if (locked) return;
    const isCorrect = optionId === block.correctOptionId;
    onExerciseResult?.({ blockId: block.id, outcome: isCorrect ? 'correct' : 'incorrect' });

    if (isCorrect) {
      setSelectedId(optionId);
      return;
    }
    setTriedIncorrectly(true);
    setFlashWrongId(optionId);
    setTimeout(() => setFlashWrongId(null), 600);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <p className="text-sm font-medium text-gray-900">{block.prompt}</p>
      <div className="mt-3 space-y-2">
        {block.options.map((option) => {
          const isCorrectOption = option.id === block.correctOptionId;
          const isFlashWrong = flashWrongId === option.id;
          const showCorrect = locked && isCorrectOption;

          let style = 'border-gray-200 bg-white hover:bg-gray-50';
          if (showCorrect) style = 'border-green-300 bg-green-50';
          else if (isFlashWrong) style = 'border-red-300 bg-red-50';

          return (
            <button
              key={option.id}
              type="button"
              disabled={locked}
              onClick={() => handleSelect(option.id)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm text-gray-800 transition-colors disabled:cursor-default ${style}`}
            >
              {option.text}
              {showCorrect && <Check size={16} className="text-green-600" />}
              {isFlashWrong && <X size={16} className="text-red-600" />}
            </button>
          );
        })}
      </div>
      {triedIncorrectly && !locked && (
        <p className="mt-3 text-xs text-amber-600">Não foi dessa vez — tente novamente.</p>
      )}
      {locked && block.explanation && <p className="mt-3 text-xs text-gray-500">{block.explanation}</p>}
    </div>
  );
}

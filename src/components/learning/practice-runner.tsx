'use client';

import { useState } from 'react';
import { Check, Volume2, X } from 'lucide-react';
import { useCommands } from '@/providers/repository.provider';
import { useJapaneseSpeech } from '@/lib/speech';
import { isRomajiAnswerCorrect, type PracticeQuestion } from '@/modules/learning/practice/exercises';

interface Props {
  workspaceId: string;
  courseId: string;
  questions: PracticeQuestion[];
  onFinish: (summary: { correct: number; total: number }) => void;
}

/**
 * Executa uma rodada de prática. Cada resposta é gravada na hora (revisão
 * espaçada). Um erro volta UMA vez ao fim da rodada para reforço imediato.
 */
export function PracticeRunner({ workspaceId, courseId, questions, onFinish }: Props) {
  const { practice } = useCommands();
  const { available, speak } = useJapaneseSpeech();
  const [queue, setQueue] = useState(questions);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<{ correct: boolean } | null>(null);
  const [typed, setTyped] = useState('');
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [retried, setRetried] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const q = queue[index];
  if (!q) return null;

  const submit = async (correct: boolean) => {
    if (answered) return;
    setAnswered({ correct });
    setError(null);
    setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    if (!correct && !retried.has(q.subject)) {
      setRetried(new Set(retried).add(q.subject));
      setQueue((list) => [...list, { ...q, id: `${q.id}-r`, reason: 'error' }]);
    }
    try {
      await practice.recordResult(workspaceId, courseId, { kind: q.itemKind, subject: q.subject, correct });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar esta resposta.');
    }
  };

  const next = () => {
    const finalScore = score;
    if (index + 1 >= queue.length) {
      onFinish(finalScore);
      return;
    }
    setIndex(index + 1);
    setAnswered(null);
    setTyped('');
  };

  const chooseOption = (id: string) => {
    if (answered) return;
    void submit(id === q.correctChoiceId);
  };

  const checkTyped = () => {
    if (answered || !typed.trim()) return;
    void submit(isRomajiAnswerCorrect(typed, q.acceptedAnswers ?? []));
  };

  const progress = Math.round((index / queue.length) * 100);

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 md:p-6">
      <div
        className="h-1.5 w-full rounded-full bg-gray-100"
        role="progressbar"
        aria-valuenow={index + 1}
        aria-valuemin={1}
        aria-valuemax={queue.length}
        aria-label="Progresso da rodada"
      >
        <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-2 text-xs text-gray-400">
        {index + 1} de {queue.length}
        {q.reason === 'error' && ' · reforço de erro'}
      </p>

      <p className="mt-4 text-center text-sm text-gray-500">{q.prompt}</p>
      <div className="mt-2 flex items-center justify-center gap-3">
        <p className="text-center text-7xl font-bold text-gray-900" lang={q.type === 'sound_to_kana' ? undefined : 'ja'}>
          {q.display}
        </p>
        {q.speak && (
          <button
            type="button"
            onClick={() => speak(q.speak!)}
            disabled={!available}
            aria-label={available ? 'Ouvir' : 'Voz japonesa indisponível neste aparelho'}
            title={available ? 'Ouvir' : 'Voz japonesa indisponível neste aparelho'}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <Volume2 size={20} />
          </button>
        )}
      </div>
      {q.translation && <p className="mt-1 text-center text-sm text-gray-500">{q.translation}</p>}

      {q.choices ? (
        <div className="mt-6 grid grid-cols-2 gap-3">
          {q.choices.map((c) => {
            const isCorrect = c.id === q.correctChoiceId;
            const style = !answered
              ? 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50'
              : isCorrect
                ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                : 'border-gray-200 bg-white text-gray-400';
            return (
              <button
                key={c.id}
                type="button"
                disabled={!!answered}
                onClick={() => chooseOption(c.id)}
                className={`min-h-16 rounded-2xl border text-2xl font-semibold ${style}`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      ) : (
        <form
          className="mt-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            checkTyped();
          }}
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={!!answered}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Sua resposta em romaji"
            placeholder="romaji"
            className="min-h-12 flex-1 rounded-2xl border border-gray-300 px-4 text-lg"
          />
          <button
            type="submit"
            disabled={!!answered || !typed.trim()}
            className="min-h-12 rounded-2xl bg-blue-600 px-5 font-semibold text-white disabled:opacity-50"
          >
            Conferir
          </button>
        </form>
      )}

      {answered && (
        <div className="mt-5" role="status">
          <p className={`flex items-center justify-center gap-2 font-semibold ${answered.correct ? 'text-emerald-700' : 'text-red-600'}`}>
            {answered.correct ? <Check size={18} /> : <X size={18} />}
            {answered.correct ? 'Certo!' : `Resposta: ${q.answerLabel}`}
          </p>
          {error && <p role="alert" className="mt-1 text-center text-xs text-red-600">{error}</p>}
          <button
            type="button"
            autoFocus
            onClick={next}
            className="mt-3 min-h-12 w-full rounded-2xl bg-blue-600 font-semibold text-white"
          >
            {index + 1 >= queue.length ? 'Concluir' : 'Próxima'}
          </button>
        </div>
      )}
    </div>
  );
}

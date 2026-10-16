'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useReactiveQuery } from '@/lib/hooks';
import { useQueries } from '@/providers/repository.provider';
import { useWorkspace } from '@/providers/auth.provider';
import { useJapaneseSpeech } from '@/lib/speech';
import { todayDateStr } from '@/lib/dates';
import { DataErrorNotice } from '@/components/data-error-notice';
import { PracticeRunner } from '@/components/learning/practice-runner';
import { buildPracticeSession, type PracticeMode, type PracticeQuestion } from '@/modules/learning/practice/exercises';

const MODES: { id: PracticeMode; title: string; hint: string }[] = [
  { id: 'mixed', title: 'Rodada mista', hint: 'Ler, reconhecer, digitar e completar palavras' },
  { id: 'review', title: 'Revisões do dia', hint: 'O que está agendado (1, 3, 7 e 14 dias)' },
  { id: 'errors', title: 'Reforçar erros', hint: 'Só o que você errou por último' },
  { id: 'type', title: 'Digitar respostas', hint: 'Kana → romaji, escrevendo' },
  { id: 'listen', title: 'Escuta', hint: 'Ouça e escolha o kana' },
];

export default function PraticarPage() {
  const { workspaceId } = useWorkspace();
  const { learning, practice } = useQueries();
  const { available: hasVoice } = useJapaneseSpeech();
  const today = todayDateStr();

  const { data: courses, error, isOffline, refetch } = useReactiveQuery(() => learning.listCourses(), []);
  const course = courses?.[0];
  const { data: pool } = useReactiveQuery(
    () => (course ? practice.getPracticePool(course.id) : Promise.resolve(null)),
    [course?.id]
  );
  const { data: overview } = useReactiveQuery(
    () => (course ? practice.getPracticeOverview(course.id, today) : Promise.resolve(null)),
    [course?.id, today]
  );

  const [round, setRound] = useState<{ questions: PracticeQuestion[]; key: number } | null>(null);
  const [result, setResult] = useState<{ correct: number; total: number } | null>(null);
  const [empty, setEmpty] = useState<string | null>(null);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <DataErrorNotice isOffline={isOffline} onRetry={refetch} />
      </div>
    );
  }

  const start = (mode: PracticeMode) => {
    if (!pool || !overview) return;
    const questions = buildPracticeSession({
      kana: pool.kana,
      words: pool.words,
      items: overview.items,
      today,
      mode,
      listening: hasVoice,
    });
    setResult(null);
    if (questions.length === 0) {
      setEmpty(
        mode === 'errors'
          ? 'Nenhum erro para reforçar agora. 🎉'
          : mode === 'review'
            ? 'Nenhuma revisão agendada para hoje.'
            : 'Não há exercícios disponíveis neste modo ainda.'
      );
      setRound(null);
      return;
    }
    setEmpty(null);
    setRound((r) => ({ questions, key: (r?.key ?? 0) + 1 }));
  };

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <Link href="/aprendizado" className="text-sm text-blue-600 hover:underline">
        ← Estudos
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-gray-900">Praticar</h1>
      <p className="mt-1 text-sm text-gray-500">
        Só entram símbolos das lições que você já abriu. Acertar várias vezes no mesmo dia não acelera a
        revisão — o intervalo cresce a cada dia.
      </p>

      {course && pool && pool.kana.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-600">
          Abra a primeira lição de Hiragana para liberar a prática.
          <div className="mt-3">
            <Link href={`/aprendizado/${course.id}`} className="font-medium text-blue-600 hover:underline">
              Ir para as lições
            </Link>
          </div>
        </div>
      )}

      {round ? (
        <div className="mt-6">
          <PracticeRunner
            key={round.key}
            workspaceId={workspaceId}
            courseId={course!.id}
            questions={round.questions}
            onFinish={(summary) => {
              setResult(summary);
              setRound(null);
            }}
          />
        </div>
      ) : (
        pool &&
        pool.kana.length > 0 && (
          <>
            {result && (
              <p role="status" className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center font-medium text-emerald-900">
                Rodada concluída: {result.correct} de {result.total} respostas certas.
              </p>
            )}
            {empty && (
              <p role="status" className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 text-center text-sm text-gray-600">
                {empty}
              </p>
            )}
            {overview && (
              <p className="mt-6 text-sm text-gray-500">
                {pool.kana.length} kana conhecidos · {overview.dueCount} revisões vencidas · {overview.errorCount} erros a reforçar
              </p>
            )}
            <div className="mt-3 grid gap-3">
              {MODES.filter((m) => m.id !== 'listen' || hasVoice).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => start(m.id)}
                  className="min-h-16 rounded-2xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50 active:scale-[0.99]"
                >
                  <span className="block font-semibold text-gray-900">{m.title}</span>
                  <span className="block text-xs text-gray-500">{m.hint}</span>
                </button>
              ))}
              {!hasVoice && (
                <p className="text-xs text-gray-400">
                  Escuta indisponível: este aparelho não tem voz japonesa instalada.
                </p>
              )}
            </div>
          </>
        )
      )}
    </div>
  );
}

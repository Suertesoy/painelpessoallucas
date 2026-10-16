'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { useWorkspace } from '@/providers/auth.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import { HandwritingPad } from '@/components/learning/handwriting-pad';

/** Escrita de Hiragana (MVP). Katakana e Kanji entram como novos alvos do mesmo componente. */
export default function EscritaPage() {
  const { workspaceId } = useWorkspace();
  const { learning, practice: practiceQueries } = useQueries();
  const { practice } = useCommands();
  const { data: courses, error, isOffline, refetch } = useReactiveQuery(() => learning.listCourses(), []);
  const course = courses?.[0];
  const { data: pool } = useReactiveQuery(
    () => (course ? practiceQueries.getPracticePool(course.id) : Promise.resolve(null)),
    [course?.id]
  );

  const [selected, setSelected] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(true);
  const [compare, setCompare] = useState(false);
  const [padKey, setPadKey] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <DataErrorNotice isOffline={isOffline} onRetry={refetch} />
      </div>
    );
  }

  const target = pool?.kana.find((k) => k.character === selected) ?? null;

  const assess = async (correct: boolean) => {
    if (!course || !target) return;
    setFeedback(null);
    try {
      await practice.recordResult(workspaceId, course.id, { kind: 'kana_write', subject: target.character, correct });
      setFeedback(correct ? 'Anotado como acerto. Boa!' : 'Anotado para treinar mais. Tente de novo.');
      setPadKey((k) => k + 1);
      setCompare(false);
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : 'Não foi possível salvar a autoavaliação.');
    }
  };

  const toggle = (on: boolean) => `min-h-11 rounded-xl border px-3 text-sm ${on ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-300 bg-white text-gray-700'}`;

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <Link href="/aprendizado" className="text-sm text-blue-600 hover:underline">
        ← Estudos
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-gray-900">Escrever</h1>
      <p className="mt-1 text-sm text-gray-500">
        Escolha um kana, desenhe e compare com o modelo. Você mesmo avalia — sem reconhecimento automático.
      </p>

      {pool && pool.kana.length === 0 && (
        <p className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-600">
          Abra a primeira lição de Hiragana para liberar a escrita.
        </p>
      )}

      {pool && pool.kana.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Escolha o kana">
          {pool.kana.map((k) => (
            <button
              key={k.character}
              type="button"
              lang="ja"
              onClick={() => {
                setSelected(k.character);
                setPadKey((n) => n + 1);
                setFeedback(null);
                setCompare(false);
              }}
              aria-pressed={selected === k.character}
              className={`h-12 min-w-12 rounded-xl border px-2 text-xl ${
                selected === k.character ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-300 bg-white text-gray-900'
              }`}
            >
              {k.character}
            </button>
          ))}
        </div>
      )}

      {target && (
        <section className="mt-6">
          <p className="text-center text-sm text-gray-500">
            Escreva <strong lang="ja">{target.character}</strong> ({target.romaji})
          </p>
          <div className="mt-3">
            <HandwritingPad key={padKey} reference={target.character} showGuide={showGuide} compare={compare} />
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button type="button" aria-pressed={showGuide} onClick={() => setShowGuide(!showGuide)} className={toggle(showGuide)}>
              Guia de fundo
            </button>
            <button type="button" aria-pressed={compare} onClick={() => setCompare(!compare)} className={toggle(compare)}>
              Comparar com o modelo
            </button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => void assess(true)} className="min-h-12 rounded-2xl bg-emerald-600 font-semibold text-white">
              Acertei
            </button>
            <button type="button" onClick={() => void assess(false)} className="min-h-12 rounded-2xl border border-gray-300 bg-white font-semibold text-gray-800">
              Preciso treinar
            </button>
          </div>
          {feedback && (
            <p role="status" className="mt-3 text-center text-sm text-gray-600">
              {feedback}
            </p>
          )}
          <p className="mt-6 text-xs text-gray-500">
            Ordem dos traços: o projeto aberto{' '}
            <a href="https://kanjivg.tagaini.net/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
              KanjiVG
            </a>{' '}
            (licença CC BY-SA 3.0) tem os traços numerados de cada kana. Ainda não está embutido no app por
            exigir atribuição e compartilhamento sob a mesma licença.
          </p>
        </section>
      )}
    </div>
  );
}

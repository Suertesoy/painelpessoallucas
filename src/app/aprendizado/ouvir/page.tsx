'use client';

import Link from 'next/link';
import { Volume2 } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useQueries } from '@/providers/repository.provider';
import { useJapaneseSpeech } from '@/lib/speech';
import { DataErrorNotice } from '@/components/data-error-notice';

/** Ouvir kana, palavras e frases já estudados, com a voz japonesa do aparelho. */
export default function OuvirPage() {
  const { learning, practice } = useQueries();
  const { available, speak } = useJapaneseSpeech();
  const { data: courses, error, isOffline, refetch } = useReactiveQuery(() => learning.listCourses(), []);
  const course = courses?.[0];
  const { data: pool } = useReactiveQuery(
    () => (course ? practice.getPracticePool(course.id) : Promise.resolve(null)),
    [course?.id]
  );

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <DataErrorNotice isOffline={isOffline} onRetry={refetch} />
      </div>
    );
  }

  const play = 'flex min-h-12 items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 text-left hover:bg-gray-50 active:scale-[0.99] disabled:opacity-50';

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <Link href="/aprendizado" className="text-sm text-blue-600 hover:underline">
        ← Estudos
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-gray-900">Ouvir</h1>
      <p className="mt-1 text-sm text-gray-500">Toque para ouvir; toque de novo para repetir. Exercícios de escuta ficam em Praticar.</p>

      {!available && (
        <p role="status" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Este aparelho não informou nenhuma voz japonesa. No iPhone, ela vem em Ajustes → Acessibilidade → Conteúdo
          Falado → Vozes → Japonês. Enquanto isso, os botões ficam desativados.
        </p>
      )}

      {pool && pool.kana.length === 0 && (
        <p className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-600">
          Abra a primeira lição de Hiragana para liberar o áudio.
        </p>
      )}

      {pool && pool.kana.length > 0 && (
        <>
          <h2 className="mt-6 font-semibold text-gray-900">Kana</h2>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {pool.kana.map((k) => (
              <button key={k.character} type="button" disabled={!available} onClick={() => speak(k.character)} className="min-h-14 rounded-2xl border border-gray-200 bg-white text-xl hover:bg-gray-50 disabled:opacity-50" aria-label={`Ouvir ${k.character} (${k.romaji})`}>
                <span lang="ja">{k.character}</span>
                <span className="block text-xs text-gray-500">{k.romaji}</span>
              </button>
            ))}
          </div>

          {pool.words.length > 0 && (
            <>
              <h2 className="mt-8 font-semibold text-gray-900">Palavras e frases</h2>
              <ul className="mt-2 space-y-2">
                {pool.words.map((w) => (
                  <li key={w.text}>
                    <button type="button" disabled={!available} onClick={() => speak(w.text)} className={`${play} w-full`} aria-label={`Ouvir ${w.text}`}>
                      <Volume2 size={18} className="shrink-0 text-blue-600" aria-hidden="true" />
                      <span>
                        <span lang="ja" className="block text-lg text-gray-900">{w.text}</span>
                        <span className="block text-xs text-gray-500">
                          {[w.romaji, w.translation].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

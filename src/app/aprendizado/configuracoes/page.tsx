'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { useWorkspace } from '@/providers/auth.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import {
  MIN_DAILY_GOAL_MINUTES,
  MAX_DAILY_GOAL_MINUTES,
  type Course,
  type CoursePreferences,
} from '@/modules/learning/domain/learning.schema';

function GeneralGoalForm({
  workspaceId,
  initialGoalMinutes,
  onSaved,
}: {
  workspaceId: string;
  initialGoalMinutes: number;
  onSaved: () => void;
}) {
  const { learning: learningCmds } = useCommands();
  // Inicializado uma única vez a partir dos dados já carregados (sem efeito
  // de sincronização): o componente só monta depois que `preferences` chega.
  const [goalInput, setGoalInput] = useState(() => String(initialGoalMinutes));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      await learningCmds.updateLearningPreferences(workspaceId, {
        defaultDailyGoalMinutes: Number(goalInput),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar a meta diária.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="font-semibold text-gray-900">Meta diária geral</h2>
      <p className="mt-1 text-sm text-gray-500">
        Vale para o cálculo do progresso do dia em todos os cursos ({MIN_DAILY_GOAL_MINUTES} a{' '}
        {MAX_DAILY_GOAL_MINUTES} minutos).
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input
          type="number"
          min={MIN_DAILY_GOAL_MINUTES}
          max={MAX_DAILY_GOAL_MINUTES}
          value={goalInput}
          onChange={(e) => setGoalInput(e.target.value)}
          className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
          aria-label="Meta diária em minutos"
        />
        <span className="text-sm text-gray-500">minutos</span>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        Salvar meta diária
      </button>
    </section>
  );
}

function CoursePreferencesForm({
  workspaceId,
  course,
  initial,
  onSaved,
}: {
  workspaceId: string;
  course: Course;
  initial: CoursePreferences;
  onSaved: () => void;
}) {
  const { learning: learningCmds } = useCommands();
  const [romaji, setRomaji] = useState(initial.showRomaji);
  const [furigana, setFurigana] = useState(initial.showFurigana);
  const [translation, setTranslation] = useState(initial.showTranslation);
  const [autoPlay, setAutoPlay] = useState(initial.autoPlayAudio);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      await learningCmds.updateCoursePreferences(workspaceId, course.id, {
        showRomaji: romaji,
        showFurigana: furigana,
        showTranslation: translation,
        autoPlayAudio: autoPlay,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar as preferências do curso.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="font-semibold text-gray-900">Preferências de exibição · {course.title}</h2>
      <p className="mt-1 text-sm text-gray-500">
        Específicas deste curso. A reprodução automática fica guardada para uso futuro — nenhum áudio
        é reproduzido nesta fase.
      </p>
      <div className="mt-4 space-y-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={romaji} onChange={(e) => setRomaji(e.target.checked)} />
          Mostrar romaji
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={furigana} onChange={(e) => setFurigana(e.target.checked)} />
          Mostrar furigana
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={translation} onChange={(e) => setTranslation(e.target.checked)} />
          Mostrar tradução
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={autoPlay} onChange={(e) => setAutoPlay(e.target.checked)} />
          Reprodução automática (preferência para uso futuro; sem áudio nesta fase)
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="mt-4 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        Salvar preferências do curso
      </button>
    </section>
  );
}

export default function AprendizadoConfiguracoesPage() {
  const { workspaceId } = useWorkspace();
  const { learning: learningQueries } = useQueries();
  const [feedback, setFeedback] = useState<string | null>(null);

  const { data: courses, error: coursesError, isOffline, refetch: refetchCourses } = useReactiveQuery(
    () => learningQueries.listCourses(),
    []
  );
  const course = courses?.[0];

  const { data: preferences, refetch: refetchPreferences } = useReactiveQuery(
    () => learningQueries.getLearningPreferences(),
    []
  );
  const { data: coursePrefs, refetch: refetchCoursePrefs } = useReactiveQuery(
    () => (course ? learningQueries.getCoursePreferences(course.id) : Promise.resolve(null)),
    [course?.id]
  );

  if (coursesError) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <DataErrorNotice isOffline={isOffline} onRetry={refetchCourses} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <Link href="/aprendizado" className="text-sm text-blue-600 hover:underline">
        ← Aprendizado
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-gray-900">Configurações de Aprendizado</h1>

      {feedback && (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {feedback}
        </p>
      )}

      {preferences && (
        <GeneralGoalForm
          key={preferences.workspaceId}
          workspaceId={workspaceId}
          initialGoalMinutes={preferences.defaultDailyGoalMinutes}
          onSaved={() => {
            refetchPreferences();
            setFeedback('Meta diária salva.');
          }}
        />
      )}

      {course && coursePrefs && (
        <CoursePreferencesForm
          key={coursePrefs.courseId}
          workspaceId={workspaceId}
          course={course}
          initial={coursePrefs}
          onSaved={() => {
            refetchCoursePrefs();
            setFeedback('Preferências do curso salvas.');
          }}
        />
      )}
    </div>
  );
}

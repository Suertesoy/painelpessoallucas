'use client';

import { use } from 'react';
import Link from 'next/link';
import { useReactiveQuery } from '@/lib/hooks';
import { useQueries } from '@/providers/repository.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import { LessonRenderer } from '@/components/learning/lesson-renderer';

export default function LicaoDetalhePage({
  params,
}: {
  params: Promise<{ courseId: string; moduleId: string; lessonId: string }>;
}) {
  const { courseId, moduleId, lessonId } = use(params);
  const { learning: learningQueries } = useQueries();

  const { data: mod, isLoading: loadingModule, error: moduleError, isOffline, refetch: refetchModule } =
    useReactiveQuery(() => learningQueries.getModuleById(moduleId), [moduleId]);
  const { data: lesson, isLoading: loadingLesson, error: lessonError, refetch: refetchLesson } = useReactiveQuery(
    () => learningQueries.getLessonById(lessonId),
    [lessonId]
  );
  const { data: progress, error: progressError, refetch: refetchProgress } = useReactiveQuery(
    () => learningQueries.getLessonProgress(lesson?.workspaceId ?? '', lessonId),
    [lessonId, lesson?.workspaceId],
    null
  );

  const isLoading = (loadingModule && !mod) || (loadingLesson && !lesson);

  if (isLoading) {
    return <div className="p-4 md:p-8 text-sm text-gray-500">Carregando lição…</div>;
  }

  if (moduleError || lessonError || progressError) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <DataErrorNotice
          isOffline={isOffline}
          onRetry={moduleError ? refetchModule : lessonError ? refetchLesson : refetchProgress}
        />
      </div>
    );
  }

  // Lição inexistente, ou pertencente a outro módulo/curso — RLS já impede o
  // vazamento entre workspaces; aqui tratamos como "não encontrada".
  if (!mod || !lesson || lesson.moduleId !== mod.id || mod.courseId !== courseId) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <p role="alert" className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
          Lição não encontrada.
        </p>
        <Link
          href={`/aprendizado/${courseId}/modulos/${moduleId}`}
          className="mt-3 inline-block text-sm text-blue-600 hover:underline"
        >
          ← Voltar ao módulo
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <Link href={`/aprendizado/${courseId}/modulos/${moduleId}`} className="text-sm text-blue-600 hover:underline">
        ← {mod.title}
      </Link>

      <h1 className="mt-2 text-2xl font-bold text-gray-900">{lesson.title}</h1>
      {lesson.description && <p className="mt-2 text-sm text-gray-600">{lesson.description}</p>}

      <div className="mt-6">
        <LessonRenderer lesson={lesson} courseId={courseId} moduleId={moduleId} progress={progress} />
      </div>
    </div>
  );
}

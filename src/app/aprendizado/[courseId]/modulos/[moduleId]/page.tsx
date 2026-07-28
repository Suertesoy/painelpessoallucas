'use client';

import { use } from 'react';
import Link from 'next/link';
import { Lock, BookOpen } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useQueries } from '@/providers/repository.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import type { ModuleStatus } from '@/modules/learning/domain/learning.schema';

const MODULE_STATUS_LABEL: Record<ModuleStatus, string> = {
  locked: 'Bloqueado',
  available: 'Disponível',
  in_progress: 'Em andamento',
  completed: 'Concluído',
};

export default function ModuloDetalhePage({
  params,
}: {
  params: Promise<{ courseId: string; moduleId: string }>;
}) {
  const { courseId, moduleId } = use(params);
  const { learning: learningQueries } = useQueries();

  const { data: course, isLoading: loadingCourse, error: courseError, isOffline, refetch: refetchCourse } =
    useReactiveQuery(() => learningQueries.getCourseById(courseId), [courseId]);
  const { data: mod, isLoading: loadingModule, error: moduleError, refetch: refetchModule } = useReactiveQuery(
    () => learningQueries.getModuleById(moduleId),
    [moduleId]
  );
  const { data: lessons, error: lessonsError, refetch: refetchLessons } = useReactiveQuery(
    () => learningQueries.listLessonsByModule(moduleId),
    [moduleId]
  );

  const isLoading = (loadingCourse && !course) || (loadingModule && !mod);

  if (isLoading) {
    return <div className="p-4 md:p-8 text-sm text-gray-500">Carregando módulo…</div>;
  }

  if (courseError || moduleError) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <DataErrorNotice isOffline={isOffline} onRetry={courseError ? refetchCourse : refetchModule} />
      </div>
    );
  }

  // Módulo inexistente, ou pertencente a outro curso/workspace (RLS já
  // impede o vazamento entre workspaces — aqui tratamos como "não encontrado").
  if (!course || !mod || mod.courseId !== course.id) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <p role="alert" className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
          Módulo não encontrado.
        </p>
        <Link href={`/aprendizado/${courseId}`} className="mt-3 inline-block text-sm text-blue-600 hover:underline">
          ← Voltar ao curso
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <Link href={`/aprendizado/${course.id}`} className="text-sm text-blue-600 hover:underline">
        ← {course.title}
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{mod.title}</h1>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
          {MODULE_STATUS_LABEL[mod.status]}
        </span>
      </div>
      {mod.description && <p className="mt-2 text-sm text-gray-600">{mod.description}</p>}

      {mod.status === 'locked' ? (
        <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
          <Lock size={28} className="mx-auto text-gray-300" />
          <p className="mt-3 text-sm text-gray-600">Este módulo ainda está bloqueado.</p>
          <p className="mt-1 text-xs text-gray-400">
            Ele será liberado conforme o progresso nos módulos anteriores, em fase futura.
          </p>
        </div>
      ) : (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <BookOpen size={18} /> Lições
          </h2>
          {lessonsError ? (
            <div className="mt-3">
              <DataErrorNotice isOffline={isOffline} onRetry={refetchLessons} />
            </div>
          ) : (lessons ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">Nenhuma lição cadastrada ainda.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {(lessons ?? [])
                .slice()
                .sort((a, b) => a.position - b.position)
                .map((lesson, index) => (
                  <li key={lesson.id} className="rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-sm font-medium text-gray-900">
                      {index + 1}. {lesson.title}
                    </p>
                    {lesson.description && (
                      <p className="mt-1 text-sm text-gray-600">{lesson.description}</p>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

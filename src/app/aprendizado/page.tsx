'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { GraduationCap, ChevronRight, Sparkles } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { useWorkspace } from '@/providers/auth.provider';
import { todayDateStr } from '@/lib/dates';
import { DataErrorNotice } from '@/components/data-error-notice';
import { DailyGoalProgress } from '@/components/learning/daily-goal-progress';
import { StudySessionCard } from '@/components/learning/study-session-card';
import { computeCourseProgress } from '@/modules/learning/domain/learning.schema';

const STATUS_LABEL: Record<string, string> = {
  active: 'Em andamento',
  archived: 'Arquivado',
};

export default function AprendizadoPage() {
  const { workspaceId } = useWorkspace();
  const { learning: learningCmds } = useCommands();
  const { learning: learningQueries } = useQueries();
  const today = todayDateStr();

  const { data: dashboard, isLoading, error, isOffline, refetch } = useReactiveQuery(
    () => learningQueries.getLearningDashboard(today),
    [today]
  );

  const [initError, setInitError] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    learningCmds
      .initializeDefaultLearningContent(workspaceId)
      .then(() => refetch())
      .catch((e) => setInitError(e instanceof Error ? e.message : 'Não foi possível preparar o Aprendizado.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  if (isLoading && !dashboard) {
    return <div className="p-4 md:p-8 text-sm text-gray-500">Carregando Aprendizado…</div>;
  }

  if (error) {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <DataErrorNotice isOffline={isOffline} onRetry={refetch} />
      </div>
    );
  }

  if (initError && !dashboard?.courses.length) {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {initError}
        </p>
      </div>
    );
  }

  const primaryCourse = dashboard?.courses[0];
  const { today: todaySummary, activeSession } = dashboard ?? {
    today: { minutesStudied: 0, goalMinutes: 15, goalMet: false },
    activeSession: null,
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <GraduationCap className="text-blue-600" size={28} />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Aprendizado</h1>
          <p className="text-sm text-gray-500">
            Estudo integrado à rotina diária — sem pressa, sem burocracia.
          </p>
        </div>
      </div>

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4 md:p-6">
        <DailyGoalProgress
          minutesStudied={todaySummary.minutesStudied}
          goalMinutes={todaySummary.goalMinutes}
          goalMet={todaySummary.goalMet}
        />
        <p className="mt-3 text-xs text-gray-500">
          Ao atingir a meta você pode parar por hoje ou continuar estudando — não há limite.
        </p>
      </section>

      {!dashboard || !primaryCourse ? (
        <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <GraduationCap size={32} className="mx-auto text-gray-300" />
          <p className="mt-3 text-sm text-gray-600">Preparando o primeiro curso…</p>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-gray-900">Sessão de hoje</h2>
            <div className="mt-3">
              <StudySessionCard
                course={primaryCourse}
                goalMinutes={todaySummary.goalMinutes}
                activeSession={activeSession}
                onChanged={refetch}
              />
            </div>
          </div>

          <div className="mt-6">
            <h2 className="text-lg font-semibold text-gray-900">Cursos</h2>
            <div className="mt-3 space-y-3">
              {dashboard.courses.map((course) => {
                const modules = dashboard.modulesByCourse[course.id] ?? [];
                const progress = computeCourseProgress(modules);
                return (
                  <Link
                    key={course.id}
                    href={`/aprendizado/${course.id}`}
                    className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{course.title}</span>
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                          {STATUS_LABEL[course.status] ?? course.status}
                        </span>
                      </div>
                      {course.description && (
                        <p className="mt-1 truncate text-xs text-gray-500">{course.description}</p>
                      )}
                      <p className="mt-1 text-xs text-gray-400">
                        Meta diária: {todaySummary.goalMinutes} min · Progresso estrutural: {progress}%
                      </p>
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-gray-400" />
                  </Link>
                );
              })}
            </div>
          </div>

          {todaySummary.goalMet && (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 md:p-6">
              <h2 className="flex items-center gap-2 font-semibold text-emerald-900">
                <Sparkles size={18} /> Continuar estudando
              </h2>
              <p className="mt-1 text-sm text-emerald-800">
                Meta de hoje concluída. Se quiser seguir, você pode:
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/aprendizado/${primaryCourse.id}`}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Abrir curso
                </Link>
                <Link
                  href={`/aprendizado/${primaryCourse.id}#modulos`}
                  className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
                >
                  Ver módulos
                </Link>
              </div>
              <p className="mt-3 text-xs text-emerald-700">
                Uma sessão adicional continua somando ao tempo total — a meta diária já está concluída.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

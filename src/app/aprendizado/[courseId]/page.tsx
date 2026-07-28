'use client';

import { use } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { Lock, CircleDot, CircleCheck, Settings, History } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useQueries } from '@/providers/repository.provider';
import { todayDateStr } from '@/lib/dates';
import { DataErrorNotice } from '@/components/data-error-notice';
import { DailyGoalProgress } from '@/components/learning/daily-goal-progress';
import { StudySessionCard } from '@/components/learning/study-session-card';
import { moduleHref, type ModuleStatus } from '@/modules/learning/domain/learning.schema';

const MODULE_STATUS_LABEL: Record<ModuleStatus, string> = {
  locked: 'Bloqueado',
  available: 'Disponível',
  in_progress: 'Em andamento',
  completed: 'Concluído',
};

const MODULE_STATUS_ICON: Record<ModuleStatus, typeof Lock> = {
  locked: Lock,
  available: CircleDot,
  in_progress: CircleDot,
  completed: CircleCheck,
};

export default function CursoDetalhePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params);
  const { learning: learningQueries } = useQueries();
  const today = todayDateStr();

  const { data: course, isLoading: loadingCourse, error: courseError, isOffline, refetch: refetchCourse } =
    useReactiveQuery(() => learningQueries.getCourseById(courseId), [courseId]);
  const { data: modules, error: modulesError, refetch: refetchModules } = useReactiveQuery(
    () => learningQueries.listModulesByCourse(courseId),
    [courseId]
  );
  const { data: activeSession, refetch: refetchSession } = useReactiveQuery(
    () => learningQueries.getActiveStudySession(),
    []
  );
  const { data: recentSessions, refetch: refetchRecent } = useReactiveQuery(
    () => learningQueries.listRecentStudySessions(),
    []
  );
  const { data: preferences, refetch: refetchPreferences } = useReactiveQuery(
    () => learningQueries.getLearningPreferences(),
    []
  );
  const goalMinutesForSummary = preferences?.defaultDailyGoalMinutes ?? course?.dailyGoalMinutes ?? 15;
  const { data: todaySummary, refetch: refetchToday } = useReactiveQuery(
    () => learningQueries.getTodayStudySummary(today, goalMinutesForSummary),
    [today, goalMinutesForSummary]
  );

  const refetchAll = () => {
    refetchCourse();
    refetchModules();
    refetchSession();
    refetchRecent();
    refetchPreferences();
    refetchToday();
  };

  if (loadingCourse && !course) {
    return <div className="p-4 md:p-8 text-sm text-gray-500">Carregando curso…</div>;
  }

  if (courseError) {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <DataErrorNotice isOffline={isOffline} onRetry={refetchCourse} />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <p role="alert" className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
          Curso não encontrado.
        </p>
        <Link href="/aprendizado" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
          ← Voltar ao Aprendizado
        </Link>
      </div>
    );
  }

  const courseSessions = (recentSessions ?? []).filter((s) => s.courseId === course.id);
  const lastSession = courseSessions.find((s) => s.status === 'completed');

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <Link href="/aprendizado" className="text-sm text-blue-600 hover:underline">
        ← Aprendizado
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{course.title}</h1>
          {course.description && <p className="mt-1 max-w-2xl text-sm text-gray-600">{course.description}</p>}
        </div>
        <Link
          href="/aprendizado/configuracoes"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Settings size={14} /> Configurações
        </Link>
      </div>

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4 md:p-6">
        <DailyGoalProgress
          minutesStudied={todaySummary?.minutesStudied ?? 0}
          goalMinutes={todaySummary?.goalMinutes ?? goalMinutesForSummary}
          goalMet={todaySummary?.goalMet ?? false}
        />
      </section>

      <div className="mt-6">
        <StudySessionCard
          course={course}
          goalMinutes={todaySummary?.goalMinutes ?? goalMinutesForSummary}
          activeSession={activeSession ?? null}
          onChanged={refetchAll}
        />
      </div>

      <section id="modulos" className="mt-6 scroll-mt-6">
        <h2 className="text-lg font-semibold text-gray-900">Módulos</h2>
        {modulesError ? (
          <div className="mt-3">
            <DataErrorNotice isOffline={isOffline} onRetry={refetchModules} />
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {(modules ?? [])
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((mod) => {
                const Icon = MODULE_STATUS_ICON[mod.status];
                const href = moduleHref(course.id, mod);
                const isLocked = href === null;
                const content = (
                  <>
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon size={18} className={isLocked ? 'text-gray-300' : 'text-blue-500'} />
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${isLocked ? 'text-gray-400' : 'text-gray-900'}`}>
                          {mod.title}
                        </p>
                        {mod.description && (
                          <p className="truncate text-xs text-gray-500">{mod.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-gray-500">
                      <div>{MODULE_STATUS_LABEL[mod.status]}</div>
                      <div>{mod.lessonsCount} lição(ões)</div>
                    </div>
                  </>
                );

                if (isLocked) {
                  return (
                    <div
                      key={mod.id}
                      aria-disabled="true"
                      className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3"
                    >
                      {content}
                    </div>
                  );
                }

                return (
                  <Link
                    key={mod.id}
                    href={href}
                    className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50 transition-colors"
                  >
                    {content}
                  </Link>
                );
              })}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <History size={18} /> Atividade recente
        </h2>
        {courseSessions.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">Nenhuma sessão registrada ainda.</p>
        ) : (
          <ul className="mt-3 space-y-1.5 text-sm text-gray-600">
            {courseSessions.slice(0, 5).map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                <span>{format(parseISO(s.startedAt), "d 'de' MMMM, HH:mm", { locale: ptBR })}</span>
                <span className="text-xs text-gray-400">
                  {s.status === 'completed'
                    ? `${s.durationMinutes} min`
                    : s.status === 'cancelled'
                      ? 'Cancelada'
                      : 'Em andamento'}
                </span>
              </li>
            ))}
          </ul>
        )}
        {lastSession && (
          <p className="mt-2 text-xs text-gray-400">
            Última sessão concluída: {format(parseISO(lastSession.startedAt), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
          </p>
        )}
      </section>
    </div>
  );
}

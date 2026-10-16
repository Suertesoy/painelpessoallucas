'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { BookOpen, ChevronRight, Headphones, PenLine, Repeat, Settings } from 'lucide-react';
import { useNow, useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { useWorkspace } from '@/providers/auth.provider';
import { todayDateStr } from '@/lib/dates';
import { formatDurationShort } from '@/lib/timer';
import { DataErrorNotice } from '@/components/data-error-notice';
import { StudySessionCard } from '@/components/learning/study-session-card';
import { computeCourseProgress, studySessionSeconds } from '@/modules/learning/domain/learning.schema';

export default function EstudosPage() {
  const now = useNow(30000);
  const { workspaceId } = useWorkspace();
  const { learning: learningCmds } = useCommands();
  const { learning: learningQueries, practice: practiceQueries } = useQueries();
  const today = todayDateStr();

  const { data: dashboard, isLoading, error, isOffline, refetch } = useReactiveQuery(
    () => learningQueries.getLearningDashboard(today),
    [today]
  );
  const primaryCourse = dashboard?.courses[0];
  const { data: overview } = useReactiveQuery(
    () => (primaryCourse ? practiceQueries.getPracticeOverview(primaryCourse.id, today) : Promise.resolve(null)),
    [primaryCourse?.id, today]
  );

  const [initError, setInitError] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    learningCmds
      .initializeDefaultLearningContent(workspaceId)
      .then(() => refetch())
      .catch((e) => setInitError(e instanceof Error ? e.message : 'Não foi possível preparar os Estudos.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  if (isLoading && !dashboard) {
    return <div className="p-4 text-sm text-gray-500 md:p-8">Carregando Estudos…</div>;
  }
  if (error) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        <DataErrorNotice isOffline={isOffline} onRetry={refetch} />
      </div>
    );
  }
  if (initError && !dashboard?.courses.length) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {initError}
        </p>
      </div>
    );
  }

  const todaySummary = dashboard?.today ?? { minutesStudied: 0, goalMinutes: 15, goalMet: false };
  const modules = primaryCourse ? (dashboard?.modulesByCourse[primaryCourse.id] ?? []) : [];
  const nowMs = now.getTime();
  const history = (dashboard?.recentSessions ?? []).filter((s) => s.status === 'completed' || s.status === 'cancelled');

  const tile =
    'flex min-h-24 flex-col justify-between rounded-2xl border border-gray-200 bg-white p-4 transition hover:bg-gray-50 active:scale-[0.98]';

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Estudos</h1>
          <p className="mt-1 text-sm text-gray-500">Japonês, no seu ritmo — repetir antes de avançar.</p>
        </div>
        <Link
          href="/aprendizado/configuracoes"
          aria-label="Ajustar meta diária e preferências"
          className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
        >
          <Settings size={20} />
        </Link>
      </div>

      {!dashboard || !primaryCourse ? (
        <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
          Preparando o curso de Japonês…
        </div>
      ) : (
        <>
          <section className="mt-6">
            <StudySessionCard
              course={primaryCourse}
              goalMinutes={todaySummary.goalMinutes}
              activeSession={dashboard.activeSession}
              completedSeconds={todaySummary.secondsStudied ?? todaySummary.minutesStudied * 60}
              onChanged={refetch}
            />
          </section>

          <nav aria-label="Atividades de estudo" className="mt-6 grid grid-cols-2 gap-3">
            <Link href={`/aprendizado/${primaryCourse.id}`} className={tile}>
              <BookOpen size={22} className="text-blue-600" aria-hidden="true" />
              <span>
                <span className="block font-semibold text-gray-900">Curso</span>
                <span className="text-xs text-gray-500">
                  {modules.length > 0 ? `Progresso ${computeCourseProgress(modules)}%` : 'Lições de Hiragana'}
                </span>
              </span>
            </Link>
            <Link href="/aprendizado/praticar" className={tile}>
              <Repeat size={22} className="text-blue-600" aria-hidden="true" />
              <span>
                <span className="block font-semibold text-gray-900">Praticar</span>
                <span className="text-xs text-gray-500">
                  {overview && overview.dueCount + overview.errorCount > 0
                    ? `${overview.dueCount + overview.errorCount} para revisar`
                    : 'Repetição do que já estudou'}
                </span>
              </span>
            </Link>
            <Link href="/aprendizado/escrita" className={tile}>
              <PenLine size={22} className="text-blue-600" aria-hidden="true" />
              <span>
                <span className="block font-semibold text-gray-900">Escrever</span>
                <span className="text-xs text-gray-500">Desenhe os kana à mão</span>
              </span>
            </Link>
            <Link href="/aprendizado/ouvir" className={tile}>
              <Headphones size={22} className="text-blue-600" aria-hidden="true" />
              <span>
                <span className="block font-semibold text-gray-900">Ouvir</span>
                <span className="text-xs text-gray-500">Kana, palavras e frases</span>
              </span>
            </Link>
          </nav>

          <section className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900">Histórico de sessões</h2>
            {history.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">Nenhuma sessão registrada ainda.</p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {history.map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2.5 text-sm">
                    <span className="text-gray-700">
                      {format(parseISO(s.startedAt), "EEE, d 'de' MMM · HH:mm", { locale: ptBR })}
                    </span>
                    <span className="text-xs text-gray-500">
                      {s.status === 'cancelled' ? 'Descartada' : formatDurationShort(studySessionSeconds(s, nowMs))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Link
            href={`/aprendizado/${primaryCourse.id}`}
            className="mt-6 flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4 hover:bg-gray-50"
          >
            <span className="text-sm text-gray-700">Abrir módulos e lições</span>
            <ChevronRight size={18} className="text-gray-400" />
          </Link>
        </>
      )}
    </div>
  );
}

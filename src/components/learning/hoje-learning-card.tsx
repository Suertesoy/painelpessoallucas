'use client';

import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { todayDateStr } from '@/lib/dates';

/**
 * Card compacto de Aprendizado na tela Hoje — apenas leitura + atalhos.
 * Nunca inicializa o curso aqui (isso é responsabilidade da própria página
 * /aprendizado); se o usuário nunca visitou o módulo, mostra um convite.
 */
export function HojeLearningCard() {
  const { learning: learningQueries } = useQueries();
  const { learning: learningCmds } = useCommands();
  const today = todayDateStr();

  const { data: dashboard, refetch } = useReactiveQuery(
    () => learningQueries.getLearningDashboard(today),
    [today]
  );

  const course = dashboard?.courses[0];

  if (!course) {
    return (
      <section className="bg-white rounded-xl shadow-sm border p-4 md:p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <GraduationCap className="text-blue-500" /> Aprendizado
        </h2>
        <p className="mt-2 text-sm text-gray-500">Você ainda não iniciou nenhum curso.</p>
        <Link href="/aprendizado" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
          Abrir Aprendizado
        </Link>
      </section>
    );
  }

  const { minutesStudied, goalMinutes, goalMet } = dashboard.today;
  const hasActiveSession = Boolean(dashboard.activeSession);

  const startQuickSession = async () => {
    try {
      await learningCmds.startStudySession(course.workspaceId, course.id);
      refetch();
    } catch {
      // Falhas (ex.: sessão já em andamento) são tratadas com detalhe em /aprendizado.
    }
  };

  return (
    <section className="bg-white rounded-xl shadow-sm border p-4 md:p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <GraduationCap className="text-blue-500" /> Aprendizado
      </h2>
      <p className="mt-2 text-sm text-gray-700">
        {course.title} · {minutesStudied} de {goalMinutes} min hoje
        {goalMet && <span className="ml-1 text-emerald-600">· meta concluída</span>}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {hasActiveSession ? (
          <Link
            href={`/aprendizado/${course.id}`}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            Continuar sessão
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => void startQuickSession()}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            Iniciar sessão
          </button>
        )}
        <Link
          href="/aprendizado"
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Abrir Aprendizado
        </Link>
      </div>
    </section>
  );
}

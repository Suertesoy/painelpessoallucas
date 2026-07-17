'use client';

import React, { use, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle, PlayCircle, PauseCircle, PencilLine } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import type { PlanStatus } from '@/modules/plans/domain/plan.schema';

const STATUS_LABEL: Record<PlanStatus, string> = {
  draft: 'Rascunho',
  awaiting_review: 'Aguardando revisão',
  approved: 'Aprovado',
  active: 'Ativo',
  paused: 'Pausado',
  completed: 'Concluído',
  archived: 'Arquivado',
};

const FREQ_LABEL: Record<string, string> = {
  daily: 'Diária',
  weekly: 'Semanal',
  monthly: 'Mensal',
  once: 'Única',
  relative_to_plan_start: 'Relativa ao início do plano',
  relative_to_phase_start: 'Relativa ao início da fase',
  relative_to_event: 'Relativa a evento',
};

export default function PlanoDetalhePage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = use(params);
  const { plan: planQueries, project: projectQueries } = useQueries();
  const { plan: planCmds } = useCommands();

  const { data: detail, isLoading, error } = useReactiveQuery(
    () => planQueries.getPlanDetail(planId),
    [planId]
  );
  const { data: projects } = useReactiveQuery(() => projectQueries.listProjects(), []);

  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erro na operação.');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-sm text-gray-500">Carregando plano…</div>;
  }

  if (error || !detail) {
    return (
      <div className="p-8">
        <p role="alert" className="text-sm text-red-700">{error ?? 'Plano não encontrado.'}</p>
        <Link href="/planos" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
          ← Voltar aos planos
        </Link>
      </div>
    );
  }

  const { plan, phases, actions, recurrenceRules } = detail;
  const projectName = plan.projectId
    ? projects?.find((p) => p.id === plan.projectId)?.name
    : null;

  const actionsByPhase = (phaseId?: string) =>
    actions.filter((a) => a.phaseId === phaseId);
  const phaselessActions = actions.filter(
    (a) => !a.phaseId || !phases.some((p) => p.id === a.phaseId)
  );

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <Link href="/planos" className="text-sm text-blue-600 hover:underline">← Planos</Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{plan.name}</h1>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
          {STATUS_LABEL[plan.status]}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap gap-x-4 text-sm text-gray-500">
        {projectName && <span>Projeto: {projectName}</span>}
        {plan.startDate && <span>Início: {plan.startDate.split('-').reverse().join('/')}</span>}
        {plan.targetDate && <span>Alvo: {plan.targetDate.split('-').reverse().join('/')}</span>}
        <span>Fuso: {plan.timezone}</span>
      </div>

      {plan.objective && <p className="mt-3 text-gray-700">{plan.objective}</p>}

      {actionError && (
        <p role="alert" className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={16} /> {actionError}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {(plan.status === 'draft' || plan.status === 'awaiting_review') && (
          <>
            <Link
              href={`/planos/${plan.id}/revisar`}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <PencilLine size={16} /> Revisar e editar
            </Link>
            <button
              disabled={busy}
              onClick={() => run(() => planCmds.approvePlan(plan.id))}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <CheckCircle size={16} /> Aprovar plano
            </button>
          </>
        )}
        {plan.status === 'approved' && (
          <button
            disabled={busy}
            onClick={() => run(() => planCmds.activatePlan(plan.id))}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            <PlayCircle size={16} /> Ativar plano
          </button>
        )}
        {plan.status === 'active' && (
          <button
            disabled={busy}
            onClick={() => run(() => planCmds.setPlanStatus(plan.id, 'paused'))}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <PauseCircle size={16} /> Pausar
          </button>
        )}
        {plan.status === 'paused' && (
          <button
            disabled={busy}
            onClick={() => run(() => planCmds.setPlanStatus(plan.id, 'active'))}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            <PlayCircle size={16} /> Retomar
          </button>
        )}
      </div>

      {/* Fases */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Fases</h2>
        {phases.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Nenhuma fase estruturada ainda.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {phases.map((phase, idx) => (
              <li key={phase.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                    {idx + 1}
                  </span>
                  <span className="font-medium">{phase.name}</span>
                  {phase.durationDays && (
                    <span className="ml-auto text-xs text-gray-500">{phase.durationDays} dias</span>
                  )}
                </div>
                {phase.description && (
                  <p className="mt-2 text-sm text-gray-600">{phase.description}</p>
                )}
                {phase.milestone && (
                  <p className="mt-1 text-xs text-emerald-700">Marco: {phase.milestone}</p>
                )}
                {phase.successCriteria && (
                  <p className="mt-1 text-xs text-gray-500">Critério de sucesso: {phase.successCriteria}</p>
                )}
                {actionsByPhase(phase.id).length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t pt-3">
                    {actionsByPhase(phase.id).map((a) => (
                      <li key={a.id} className="flex items-start gap-2 text-sm">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
                        <div>
                          <span>{a.title}</span>
                          <span className="ml-2 text-xs text-gray-400">
                            {a.actionType === 'routine' ? 'rotina' : a.actionType}
                            {a.estimatedMinutes ? ` · ${a.estimatedMinutes}min` : ''}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Ações sem fase */}
      {phaselessActions.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Ações gerais</h2>
          <ul className="mt-2 space-y-1.5">
            {phaselessActions.map((a) => (
              <li key={a.id} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm">
                {a.title}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recorrências */}
      <section className="mt-6">
        <h2 className="text-lg font-semibold">Rotinas recorrentes</h2>
        {recurrenceRules.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Nenhuma recorrência definida.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {recurrenceRules.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm">
                <span>
                  {FREQ_LABEL[r.frequency] ?? r.frequency}
                  {r.localTime ? ` às ${r.localTime.slice(0, 5)}` : ''}
                  {r.daysOfWeek && r.daysOfWeek.length > 0
                    ? ` (${r.daysOfWeek.map((d) => ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d]).join(', ')})`
                    : ''}
                </span>
                <span className={`text-xs ${r.isActive ? 'text-green-700' : 'text-gray-400'}`}>
                  {r.isActive ? 'Ativa' : 'Inativa'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

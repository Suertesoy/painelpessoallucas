'use client';

import React, { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle, PlayCircle, PauseCircle, PencilLine, RotateCcw } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import type { PlanStatus } from '@/modules/plans/domain/plan.schema';
import { formatRecurrenceRuleLabel } from '@/modules/plans/domain/recurrence-label';

const STATUS_LABEL: Record<PlanStatus, string> = {
  draft: 'Rascunho',
  awaiting_review: 'Aguardando revisão',
  approved: 'Aprovado',
  active: 'Ativo',
  paused: 'Pausado',
  completed: 'Concluído',
  archived: 'Arquivado',
};

export default function PlanoDetalhePage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = use(params);
  const router = useRouter();
  const { plan: planQueries, project: projectQueries } = useQueries();
  const { plan: planCmds } = useCommands();

  const { data: detail, isLoading, error, isOffline, refetch } = useReactiveQuery(
    () => planQueries.getPlanDetail(planId),
    [planId]
  );
  const { data: projects } = useReactiveQuery(() => projectQueries.listProjects(), []);

  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingReprocess, setConfirmingReprocess] = useState(false);

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

  if (error) {
    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        <DataErrorNotice isOffline={isOffline} onRetry={refetch} />
        <Link href="/planos" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
          ← Voltar aos planos
        </Link>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-500">Plano não encontrado.</p>
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

  // Uma rotina é UMA atividade recorrente (atividade + frequência + horário),
  // nunca duas informações soltas: a regra vinculada aparece dentro do card
  // da própria ação (recurrenceRuleId), nunca só numa lista separada.
  const ruleById = new Map(recurrenceRules.map((r) => [r.id, r]));
  const referencedRuleIds = new Set(
    actions.filter((a) => a.recurrenceRuleId).map((a) => a.recurrenceRuleId)
  );
  const orphanRules = recurrenceRules.filter((r) => !referencedRuleIds.has(r.id));

  const actionMeta = (a: (typeof actions)[number]) => {
    const rule = a.recurrenceRuleId ? ruleById.get(a.recurrenceRuleId) : undefined;
    return (
      <span className="ml-2 text-xs text-gray-400">
        {a.actionType === 'routine' ? 'rotina' : a.actionType}
        {a.estimatedMinutes ? ` · ${a.estimatedMinutes}min` : ''}
        {rule ? ` · ${formatRecurrenceRuleLabel(rule)}` : ''}
      </span>
    );
  };

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
            {plan.sourceDocumentId && !confirmingReprocess && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmingReprocess(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                <RotateCcw size={16} /> Reprocessar com IA
              </button>
            )}
            {plan.sourceDocumentId && confirmingReprocess && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <span>Isso arquiva este rascunho (não apaga) e gera um novo a partir do documento original. Confirmar?</span>
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/planos/processar/${plan.sourceDocumentId}?force=true${
                        plan.startDate ? `&startDate=${plan.startDate}` : ''
                      }`
                    )
                  }
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingReprocess(false)}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                >
                  Cancelar
                </button>
              </div>
            )}
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
                          {actionMeta(a)}
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
                {actionMeta(a)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recorrências sem ação associada — o caso comum já aparece dentro do
          card de cada ação (rotina) acima; esta seção só existe para nunca
          esconder uma regra órfã. */}
      {orphanRules.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Outras recorrências</h2>
          <p className="mt-1 text-xs text-gray-500">Sem ação vinculada nesta leitura.</p>
          <ul className="mt-2 space-y-1.5">
            {orphanRules.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm">
                <span>{formatRecurrenceRuleLabel(r)}</span>
                <span className={`text-xs ${r.isActive ? 'text-green-700' : 'text-gray-400'}`}>
                  {r.isActive ? 'Ativa' : 'Inativa'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

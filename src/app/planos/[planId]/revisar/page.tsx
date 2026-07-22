'use client';

import React, { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PlanDetail } from '@/modules/plans/domain/plan.schema';
import type { PlanProposal } from '@/modules/plans/domain/plan-proposal.schema';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Lightbulb,
  ClipboardCheck,
  Trash2,
} from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import type {
  PlanAction,
  PlanPhase,
  RecurrenceRule,
} from '@/modules/plans/domain/plan.schema';

/**
 * Tela de revisão da proposta da IA.
 *
 * Diferenciação visual obrigatória:
 * - Fato informado (verde, ClipboardCheck)  → veio do documento
 * - Hipótese (âmbar, AlertTriangle)         → suposição da IA
 * - Sugestão da IA (azul, Lightbulb)        → proposta editável
 * - Decisão aprovada (verde-escuro, Check)  → decisões registradas no texto
 * - Pergunta aberta (roxo, HelpCircle)      → precisa de resposta do Lucas
 */
function Badge({ children, tone }: { children: React.ReactNode; tone: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {children}
    </span>
  );
}

export default function RevisarPlanoPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = use(params);
  const { plan: planQueries } = useQueries();

  const {
    data: detail,
    isLoading,
    error: detailError,
    isOffline,
    refetch: refetchDetail,
  } = useReactiveQuery(
    () => planQueries.getPlanDetail(planId),
    [planId]
  );
  const { data: proposal, error: proposalError, refetch: refetchProposal } = useReactiveQuery(
    () => planQueries.getPlanProposal(planId),
    [planId]
  );
  const error = detailError ?? proposalError;

  if (isLoading) {
    return <div className="p-8 text-sm text-gray-500">Carregando revisão…</div>;
  }

  if (error) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <DataErrorNotice
          isOffline={isOffline}
          onRetry={() => {
            refetchDetail();
            refetchProposal();
          }}
        />
      </div>
    );
  }

  if (!detail) {
    return <div className="p-8 text-sm text-gray-500">Plano não encontrado.</div>;
  }

  // key remonta o editor quando o plano muda; o estado editável nasce nos
  // inicializadores de useState (sem setState em effect).
  return (
    <ReviewEditor
      key={detail.plan.id}
      planId={planId}
      detail={detail}
      proposal={proposal ?? null}
    />
  );
}

function ReviewEditor({
  planId,
  detail,
  proposal,
}: {
  planId: string;
  detail: PlanDetail;
  proposal: PlanProposal | null;
}) {
  const router = useRouter();
  const { plan: planCmds } = useCommands();
  const { plan } = detail;

  // Estado editável local (aplicado com "Salvar alterações").
  const [name, setName] = useState(plan.name);
  const [objective, setObjective] = useState(plan.objective ?? '');
  const [startDate, setStartDate] = useState(plan.startDate ?? '');
  const [targetDate, setTargetDate] = useState(plan.targetDate ?? '');
  const [phases, setPhases] = useState<PlanPhase[]>(detail.phases);
  const [actions, setActions] = useState<PlanAction[]>(detail.actions);
  const [rules, setRules] = useState<RecurrenceRule[]>(detail.recurrenceRules);
  const [deletedActionIds, setDeletedActionIds] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const readOnly = plan.status !== 'draft' && plan.status !== 'awaiting_review';

  const updatePhase = (id: string, patch: Partial<PlanPhase>) =>
    setPhases((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const updateAction = (id: string, patch: Partial<PlanAction>) =>
    setActions((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const removeAction = (id: string) => {
    setActions((prev) => prev.filter((a) => a.id !== id));
    setDeletedActionIds((prev) => [...prev, id]);
  };

  const updateRule = (id: string, patch: Partial<RecurrenceRule>) =>
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await planCmds.updatePlan({
        ...plan,
        name: name.trim() || plan.name,
        objective: objective.trim() || undefined,
        startDate: startDate || undefined,
        targetDate: targetDate || undefined,
      });
      await planCmds.savePhases(phases);
      await planCmds.saveActions(actions);
      await planCmds.saveRecurrenceRules(rules);
      for (const id of deletedActionIds) {
        await planCmds.deleteAction(id);
      }
      setDeletedActionIds([]);
      setFeedback('Alterações salvas.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar alterações.');
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async () => {
    setBusy(true);
    setError(null);
    try {
      await handleSave();
      await planCmds.approvePlan(planId);
      router.push(`/planos/${planId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao aprovar o plano.');
      setBusy(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto pb-32">
      <Link href={`/planos/${planId}`} className="text-sm text-blue-600 hover:underline">
        ← Plano
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Revisar proposta</h1>
      <p className="mt-1 text-sm text-gray-500">
        Tudo abaixo é <strong>proposta da IA</strong> até você aprovar. Edite o que
        precisar; nada vira tarefa automaticamente.
      </p>

      {proposal && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="bg-blue-50 text-blue-700">
            <Lightbulb size={12} /> Confiança da IA: {(proposal.confidence * 100).toFixed(0)}%
          </Badge>
          {proposal.warnings.map((w, i) => (
            <Badge key={i} tone="bg-amber-50 text-amber-800">
              <AlertTriangle size={12} /> {w}
            </Badge>
          ))}
        </div>
      )}

      {readOnly && (
        <p className="mt-4 rounded-lg bg-gray-100 p-3 text-sm text-gray-600">
          Este plano já foi aprovado — a revisão está em modo somente leitura.
        </p>
      )}

      {/* Fatos × hipóteses × decisões × perguntas */}
      {proposal && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <section className="rounded-xl border border-green-200 bg-green-50/50 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-green-800">
              <ClipboardCheck size={16} /> Fatos informados no documento
            </h2>
            <ul className="mt-2 space-y-1 text-sm text-green-900">
              {proposal.confirmedFacts.length === 0 && <li className="text-green-700/60">Nenhum.</li>}
              {proposal.confirmedFacts.map((f, i) => <li key={i}>• {f}</li>)}
            </ul>
          </section>

          <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-800">
              <AlertTriangle size={16} /> Hipóteses da IA (verificar)
            </h2>
            <ul className="mt-2 space-y-1 text-sm text-amber-900">
              {proposal.assumptions.length === 0 && <li className="text-amber-700/60">Nenhuma.</li>}
              {proposal.assumptions.map((a, i) => <li key={i}>• {a}</li>)}
            </ul>
          </section>

          <section className="rounded-xl border border-emerald-300 bg-emerald-50/50 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
              <CheckCircle size={16} /> Decisões registradas no documento
            </h2>
            <ul className="mt-2 space-y-1 text-sm text-emerald-900">
              {proposal.decisions.length === 0 && <li className="text-emerald-700/60">Nenhuma.</li>}
              {proposal.decisions.map((d, i) => <li key={i}>• {d}</li>)}
            </ul>
          </section>

          <section className="rounded-xl border border-purple-200 bg-purple-50/50 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-purple-800">
              <HelpCircle size={16} /> Perguntas em aberto
            </h2>
            <ul className="mt-2 space-y-1 text-sm text-purple-900">
              {proposal.openQuestions.length === 0 && <li className="text-purple-700/60">Nenhuma.</li>}
              {proposal.openQuestions.map((q, i) => <li key={i}>• {q}</li>)}
            </ul>
          </section>
        </div>
      )}

      {/* Riscos e aguardando */}
      {proposal && (proposal.risks.length > 0 || proposal.waitingItems.length > 0) && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {proposal.risks.length > 0 && (
            <section className="rounded-xl border border-red-200 bg-red-50/50 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-red-800">
                <AlertCircle size={16} /> Riscos identificados
              </h2>
              <ul className="mt-2 space-y-1 text-sm text-red-900">
                {proposal.risks.map((r, i) => <li key={i}>• {r}</li>)}
              </ul>
            </section>
          )}
          {proposal.waitingItems.length > 0 && (
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-700">Aguardando terceiros</h2>
              <ul className="mt-2 space-y-1 text-sm text-gray-600">
                {proposal.waitingItems.map((w, i) => <li key={i}>• {w}</li>)}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* Dados do plano (editáveis) */}
      <section className="mt-6 rounded-xl border border-blue-200 bg-white p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Lightbulb size={16} className="text-blue-600" /> Plano (sugestão da IA — editável)
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="plan-name" className="block text-sm font-medium text-gray-700">Nome</label>
            <input
              id="plan-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={readOnly}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="plan-objective" className="block text-sm font-medium text-gray-700">Objetivo</label>
            <textarea
              id="plan-objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              disabled={readOnly}
              rows={2}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
            />
          </div>
          <div>
            <label htmlFor="plan-start" className="block text-sm font-medium text-gray-700">Data inicial</label>
            <input
              id="plan-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={readOnly}
              className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
            />
          </div>
          <div>
            <label htmlFor="plan-target" className="block text-sm font-medium text-gray-700">Data alvo</label>
            <input
              id="plan-target"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              disabled={readOnly}
              className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
            />
          </div>
        </div>
      </section>

      {/* Fases editáveis */}
      <section className="mt-4 rounded-xl border border-blue-200 bg-white p-5">
        <h2 className="font-semibold">Fases e cronograma</h2>
        {phases.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">A proposta não tem fases.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {phases.map((phase, idx) => (
              <li key={phase.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                    {idx + 1}
                  </span>
                  <input
                    aria-label={`Nome da fase ${idx + 1}`}
                    value={phase.name}
                    onChange={(e) => updatePhase(phase.id, { name: e.target.value })}
                    disabled={readOnly}
                    className="min-w-0 flex-1 rounded border border-transparent px-2 py-1 text-sm font-medium hover:border-gray-200 focus:border-blue-400 disabled:bg-transparent"
                  />
                  <label className="flex items-center gap-1 text-xs text-gray-500">
                    Duração (dias):
                    <input
                      type="number"
                      min={1}
                      value={phase.durationDays ?? ''}
                      onChange={(e) =>
                        updatePhase(phase.id, {
                          durationDays: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      disabled={readOnly}
                      className="w-16 rounded border border-gray-200 px-1.5 py-0.5 text-xs"
                    />
                  </label>
                </div>
                {phase.milestone && (
                  <p className="mt-1.5 pl-8 text-xs text-emerald-700">Marco: {phase.milestone}</p>
                )}
                {phase.successCriteria && (
                  <p className="mt-0.5 pl-8 text-xs text-gray-500">Sucesso: {phase.successCriteria}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Ações editáveis */}
      <section className="mt-4 rounded-xl border border-blue-200 bg-white p-5">
        <h2 className="font-semibold">Ações propostas</h2>
        <p className="mt-1 text-xs text-gray-500">
          Ações marcadas com “confirmar” precisam da sua atenção antes de virarem tarefas.
        </p>
        <ul className="mt-3 space-y-2">
          {actions.map((action) => (
            <li key={action.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  aria-label="Título da ação"
                  value={action.title}
                  onChange={(e) => updateAction(action.id, { title: e.target.value })}
                  disabled={readOnly}
                  className="min-w-0 flex-1 rounded border border-transparent px-2 py-1 text-sm hover:border-gray-200 focus:border-blue-400 disabled:bg-transparent"
                />
                <select
                  aria-label="Prioridade"
                  value={action.priority}
                  onChange={(e) =>
                    updateAction(action.id, { priority: e.target.value as PlanAction['priority'] })
                  }
                  disabled={readOnly}
                  className="rounded border border-gray-200 px-1.5 py-1 text-xs"
                >
                  <option value="low">Baixa</option>
                  <option value="normal">Normal</option>
                  <option value="high">Alta</option>
                  <option value="critical">Crítica</option>
                </select>
                <input
                  aria-label="Minutos estimados"
                  type="number"
                  min={5}
                  step={5}
                  placeholder="min"
                  value={action.estimatedMinutes ?? ''}
                  onChange={(e) =>
                    updateAction(action.id, {
                      estimatedMinutes: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  disabled={readOnly}
                  className="w-16 rounded border border-gray-200 px-1.5 py-1 text-xs"
                />
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeAction(action.id)}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Remover ação ${action.title}`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5 pl-2 text-xs">
                <span className="text-gray-400">{action.actionType === 'routine' ? 'rotina' : action.actionType}</span>
                {action.requiresConfirmation && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">confirmar</span>
                )}
                {action.waitingOn && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
                    aguardando: {action.waitingOn}
                  </span>
                )}
                {action.dueRule?.type === 'fixed' && (
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
                    prazo sugerido: {action.dueRule.date.split('-').reverse().join('/')}
                  </span>
                )}
              </div>
              {action.description && (
                <p className="mt-1 pl-2 text-xs text-gray-500">{action.description}</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Recorrências */}
      <section className="mt-4 rounded-xl border border-blue-200 bg-white p-5">
        <h2 className="font-semibold">Rotinas recorrentes propostas</h2>
        {rules.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Nenhuma recorrência proposta.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rules.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-3 text-sm">
                <span className="capitalize">
                  {{ daily: 'Diária', weekly: 'Semanal', monthly: 'Mensal', once: 'Única' }[
                    rule.frequency as 'daily' | 'weekly' | 'monthly' | 'once'
                  ] ?? rule.frequency}
                </span>
                <label className="flex items-center gap-1 text-xs text-gray-500">
                  Horário:
                  <input
                    type="time"
                    value={rule.localTime?.slice(0, 5) ?? ''}
                    onChange={(e) => updateRule(rule.id, { localTime: e.target.value || undefined })}
                    disabled={readOnly}
                    className="rounded border border-gray-200 px-1.5 py-0.5 text-xs"
                  />
                </label>
                {rule.daysOfWeek && rule.daysOfWeek.length > 0 && (
                  <span className="text-xs text-gray-500">
                    ({rule.daysOfWeek.map((d) => ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d]).join(', ')})
                  </span>
                )}
                <span className="ml-auto text-xs text-gray-400">
                  ativada somente após aprovação
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Barra de ações */}
      {error && (
        <p role="alert" className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </p>
      )}
      {feedback && (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {feedback}
        </p>
      )}

      {!readOnly && (
        <div className="fixed inset-x-0 bottom-0 border-t bg-white/95 p-3 backdrop-blur md:pl-64">
          <div className="mx-auto flex max-w-5xl flex-wrap justify-end gap-2 px-4">
            <button
              type="button"
              disabled={busy}
              onClick={handleSave}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Salvar alterações
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleApprove}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <CheckCircle size={16} /> {busy ? 'Processando…' : 'Aprovar plano'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

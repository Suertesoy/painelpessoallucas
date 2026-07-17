'use client';

import React from 'react';
import Link from 'next/link';
import { Plus, FileText, AlertCircle } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useQueries } from '@/providers/repository.provider';
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

const STATUS_STYLE: Record<PlanStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  awaiting_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  paused: 'bg-orange-100 text-orange-800',
  completed: 'bg-emerald-100 text-emerald-800',
  archived: 'bg-gray-100 text-gray-500',
};

const DOC_STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando processamento',
  queued: 'Na fila',
  processing: 'Processando…',
  completed: 'Processado',
  failed: 'Falhou',
};

export default function PlanosPage() {
  const { plan: planQueries, project: projectQueries } = useQueries();
  const { data: plans, isLoading, error } = useReactiveQuery(() => planQueries.listPlans(), []);
  const { data: documents } = useReactiveQuery(() => planQueries.listDocuments(), []);
  const { data: projects } = useReactiveQuery(() => projectQueries.listProjects(), []);

  const projectName = (id?: string) =>
    id ? projects?.find((p) => p.id === id)?.name ?? '—' : '—';

  const documentsWithoutPlan = (documents ?? []).filter(
    (d) => !(plans ?? []).some((p) => p.sourceDocumentId === d.id)
  );

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Planos</h1>
        <Link
          href="/planos/novo"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus size={16} /> Importar plano
        </Link>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Importe um documento, estruture com IA, revise e aprove. O plano aprovado é a
        definição; as tarefas são geradas conforme a execução.
      </p>

      {error && (
        <p role="alert" className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </p>
      )}

      {isLoading ? (
        <p className="mt-8 text-sm text-gray-500">Carregando planos…</p>
      ) : (
        <>
          {(plans ?? []).length === 0 && documentsWithoutPlan.length === 0 && (
            <div className="mt-8 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
              <FileText size={32} className="mx-auto text-gray-300" />
              <p className="mt-3 text-sm text-gray-600">
                Nenhum plano ainda. Importe um documento para começar.
              </p>
              <Link
                href="/planos/novo"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Plus size={16} /> Importar primeiro plano
              </Link>
            </div>
          )}

          {(plans ?? []).length > 0 && (
            <ul className="mt-6 space-y-3">
              {(plans ?? []).map((plan) => (
                <li key={plan.id}>
                  <Link
                    href={`/planos/${plan.id}`}
                    className="block rounded-xl border border-gray-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{plan.name}</span>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[plan.status]}`}>
                        {STATUS_LABEL[plan.status]}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                      <span>Projeto: {projectName(plan.projectId)}</span>
                      {plan.startDate && <span>Início: {plan.startDate.split('-').reverse().join('/')}</span>}
                      {plan.targetDate && <span>Alvo: {plan.targetDate.split('-').reverse().join('/')}</span>}
                    </div>
                    {plan.objective && (
                      <p className="mt-2 line-clamp-2 text-sm text-gray-600">{plan.objective}</p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {documentsWithoutPlan.length > 0 && (
            <section className="mt-8">
              <h2 className="text-sm font-semibold text-gray-700">Documentos importados sem plano</h2>
              <ul className="mt-2 space-y-2">
                {documentsWithoutPlan.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={16} className="shrink-0 text-gray-400" />
                      <span className="truncate">{doc.title}</span>
                    </div>
                    <span className="ml-3 shrink-0 text-xs text-gray-500">
                      {DOC_STATUS_LABEL[doc.processingStatus] ?? doc.processingStatus}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

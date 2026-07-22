'use client';

import React from 'react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { Item, UpdateItemDTO } from '@/modules/items/domain/item.schema';
import { dateInputToISO } from '@/lib/dates';
import { DataErrorNotice } from '@/components/data-error-notice';
import { Activity, AlertTriangle, CheckCircle, Clock, Inbox, Layout } from 'lucide-react';
import Link from 'next/link';

export default function RevisaoPage() {
  const { item: itemQueries, project: projectQueries } = useQueries();
  const { item: itemCmds } = useCommands();

  const {
    data: reviewOverview,
    isLoading: isLoadingOverview,
    error: overviewError,
    isOffline,
    refetch: refetchOverview,
  } = useReactiveQuery(() => itemQueries.getReviewOverview(), []);
  const {
    data: projects,
    isLoading: isLoadingProjects,
    error: projectsError,
    refetch: refetchProjects,
  } = useReactiveQuery(() => projectQueries.listProjects(), []);
  const error = overviewError ?? projectsError;
  const refetch = () => {
    refetchOverview();
    refetchProjects();
  };

  const activeProjectsWithoutMilestone = projects?.filter(p => p.status === 'active' && !p.nextMilestone) || [];

  const totalIssues = (reviewOverview?.overdue.length || 0) +
                      (reviewOverview?.blocked.length || 0) +
                      (reviewOverview?.oldInbox.length || 0) +
                      (reviewOverview?.noProject.length || 0) +
                      activeProjectsWithoutMilestone.length;

  const handleOrganize = async (id: string, updates: UpdateItemDTO) => {
    await itemCmds.updateItem(id, updates);
  };

  const handleArchive = async (id: string) => {
    await itemCmds.archiveItem(id);
  };

  if (isLoadingOverview || isLoadingProjects) {
    return <div className="p-4 md:p-8 max-w-4xl mx-auto">Carregando Revisão...</div>;
  }

  if (error) {
    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2 mb-6">
          <Activity className="text-blue-600" /> Revisão do Sistema
        </h1>
        <DataErrorNotice isOffline={isOffline} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto h-full flex flex-col">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <Activity className="text-blue-600" /> Revisão do Sistema
        </h1>
        <p className="text-gray-600 mt-1">Análise determinística para manter sua central operacional limpa e acionável.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Prazos Estourados" count={reviewOverview?.overdue.length || 0} icon={<Clock className="text-red-500" />} color="bg-red-50 text-red-700 border-red-200" />
        <StatCard title="Bloqueados" count={reviewOverview?.blocked.length || 0} icon={<AlertTriangle className="text-orange-500" />} color="bg-orange-50 text-orange-700 border-orange-200" />
        <StatCard title="Inbox Antiga (>30d)" count={reviewOverview?.oldInbox.length || 0} icon={<Inbox className="text-yellow-500" />} color="bg-yellow-50 text-yellow-700 border-yellow-200" />
        <StatCard title="Proj. Sem Marco" count={activeProjectsWithoutMilestone.length} icon={<Layout className="text-blue-500" />} color="bg-blue-50 text-blue-700 border-blue-200" />
      </div>

      <div className="flex-1 overflow-auto bg-white rounded-xl shadow-sm border p-4 md:p-6">
        {totalIssues === 0 ? (
          <div className="text-center py-20 text-green-700">
            <CheckCircle className="mx-auto mb-4 text-green-400" size={64} />
            <h2 className="text-2xl font-bold">Sistema em ordem</h2>
            <p className="text-gray-600 mt-2">Você não possui pendências estruturais no seu painel.</p>
          </div>
        ) : (
          <div className="space-y-8">

            <Section
              title="Prazos Estourados"
              items={reviewOverview?.overdue || []}
              description="Itens cuja Data Limite (Due Date) já passou."
              headerIcon={<Clock className="text-red-500" size={20} />}
              renderAction={(item) => (
                <div className="flex gap-2 items-center">
                  <label className="text-xs text-gray-500" htmlFor={`redate-${item.id}`}>Novo prazo:</label>
                  <input
                    id={`redate-${item.id}`}
                    type="date"
                    className="text-xs border rounded p-1"
                    onChange={(e) => {
                      const iso = dateInputToISO(e.target.value);
                      if (iso) handleOrganize(item.id, { dueAt: iso });
                    }}
                  />
                  <button onClick={() => handleArchive(item.id)} className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200">Arquivar</button>
                </div>
              )}
            />

            <Section
              title="Tarefas Bloqueadas"
              items={reviewOverview?.blocked || []}
              description="Itens que estão travados esperando alguma coisa."
              headerIcon={<AlertTriangle className="text-orange-500" size={20} />}
              renderAction={(item) => (
                <button onClick={() => handleOrganize(item.id, { status: 'in_progress' })} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">
                  Desbloquear
                </button>
              )}
            />

            <Section
              title="Inbox Estagnada"
              items={reviewOverview?.oldInbox || []}
              description="Itens capturados há mais de 30 dias que nunca foram processados."
              headerIcon={<Inbox className="text-yellow-500" size={20} />}
              renderAction={(item) => (
                <div className="flex gap-2">
                  <button onClick={() => handleOrganize(item.id, { status: 'organized' })} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">Organizar</button>
                  <button onClick={() => handleArchive(item.id)} className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200">Arquivar</button>
                </div>
              )}
            />

            <Section
              title="Itens organizados sem projeto"
              items={reviewOverview?.noProject || []}
              description="Itens que saíram da Inbox mas não pertencem a nenhum projeto."
              headerIcon={<Layout className="text-gray-500" size={20} />}
              renderAction={() => (
                <Link href="/ideias" className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200">
                  Revisar em Ideias
                </Link>
              )}
            />

            <div className="border-t pt-8">
              <h3 className="text-lg font-bold flex items-center gap-2 mb-1">
                <Layout className="text-blue-500" size={20} /> Projetos Ativos sem Próximo Marco
              </h3>
              <p className="text-sm text-gray-500 mb-4">Projetos ativos precisam ter um próximo passo claro definido.</p>

              {activeProjectsWithoutMilestone.length === 0 ? (
                <p className="text-sm text-gray-400 italic">Todos os projetos ativos possuem marcos.</p>
              ) : (
                <div className="space-y-3">
                  {activeProjectsWithoutMilestone.map(proj => (
                    <div key={proj.id} className="p-3 border rounded-lg flex justify-between items-center">
                      <div className="font-medium">{proj.name}</div>
                      <Link href={`/projetos/${proj.id}`} className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
                        Definir Marco
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  count: number;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ title, count, icon, color }: StatCardProps) {
  return (
    <div className={`p-4 rounded-xl border ${color}`}>
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-sm">{title}</h3>
        {icon}
      </div>
      <div className="text-3xl font-black">{count}</div>
    </div>
  );
}

interface SectionProps {
  title: string;
  items: Item[];
  description: string;
  headerIcon: React.ReactNode;
  renderAction: (item: Item) => React.ReactNode;
}

function Section({ title, items, description, headerIcon, renderAction }: SectionProps) {
  if (items.length === 0) return null;

  return (
    <div className="border-t pt-8 first:border-0 first:pt-0">
      <h3 className="text-lg font-bold flex items-center gap-2 mb-1">
        {headerIcon} {title}
      </h3>
      <p className="text-sm text-gray-500 mb-4">{description}</p>

      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="p-3 border rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="font-medium text-gray-900 truncate">{item.title}</div>
              <div className="text-xs text-gray-500 mt-1 uppercase tracking-wide">{item.type}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {renderAction(item)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

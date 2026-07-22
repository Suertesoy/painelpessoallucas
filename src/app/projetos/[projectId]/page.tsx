'use client';

import React, { use, useMemo } from 'react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { Item } from '@/modules/items/domain/item.schema';
import { UpdateProjectDTO, ProjectStatus, ProjectAttentionLevel } from '@/modules/projects/domain/project.schema';
import { ItemCommands } from '@/modules/items/application/item.commands';
import { dateInputToISO, isoToDateInput } from '@/lib/dates';
import { DataErrorNotice } from '@/components/data-error-notice';
import { ArrowLeft, CheckCircle, Lightbulb, FileText, Target, Archive } from 'lucide-react';
import Link from 'next/link';

export default function ProjetoDetalhePage({ params }: { params: Promise<{ projectId: string }> }) {
  // No Next.js 15+, `params` é uma Promise — precisa ser desembrulhada com React.use()
  const { projectId } = use(params);
  const { project: projectQueries, item: itemQueries } = useQueries();
  const { project: projectCmds, item: itemCmds } = useCommands();

  const {
    data: project,
    isLoading: isLoadingProject,
    error: projectError,
    isOffline,
    refetch: refetchProject,
  } = useReactiveQuery(() => projectQueries.getProjectById(projectId), [projectId]);
  const { data: items, isLoading: isLoadingItems, error: itemsError, refetch: refetchItems } = useReactiveQuery(() => itemQueries.listItems(), []);
  const error = projectError ?? itemsError;
  const refetch = () => {
    refetchProject();
    refetchItems();
  };

  const projectItems = useMemo(() => {
    if (!items) return [];
    return items.filter(i => i.projectId === projectId);
  }, [items, projectId]);

  const tasks = projectItems.filter(i => i.type === 'task' && i.status !== 'archived');
  const ideas = projectItems.filter(i => i.type === 'idea' && i.status !== 'archived');
  const insights = projectItems.filter(i => i.type === 'insight' && i.status !== 'archived');
  const decisions = projectItems.filter(i => i.type === 'decision' && i.status !== 'archived');
  const references = projectItems.filter(i => (i.type === 'reference' || i.type === 'note') && i.status !== 'archived');
  const archived = projectItems.filter(i => i.status === 'archived');

  const handleUpdateProject = async (updates: UpdateProjectDTO) => {
    await projectCmds.updateProject(projectId, updates);
  };

  const handleArchiveProject = async () => {
    if (confirm('Tem certeza que deseja arquivar este projeto?')) {
      await projectCmds.archiveProject(projectId);
    }
  };

  if (isLoadingProject || isLoadingItems) {
    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto h-full flex flex-col justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4" aria-hidden="true"></div>
        <p className="text-gray-500">Carregando dados locais do projeto...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        <Link href="/projetos" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors">
          <ArrowLeft size={16} /> Voltar para Projetos
        </Link>
        <DataErrorNotice isOffline={isOffline} onRetry={refetch} />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto text-center py-20">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Projeto Inexistente</h1>
        <p className="text-gray-600 mb-8">O projeto que você está tentando acessar não existe ou foi removido.</p>
        <Link href="/projetos" className="text-blue-600 hover:underline inline-flex items-center gap-2">
          <ArrowLeft size={16} /> Voltar para Projetos
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <Link href="/projetos" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors">
        <ArrowLeft size={16} /> Voltar para Projetos
      </Link>

      <div className="bg-white rounded-xl shadow-sm border p-4 md:p-6 mb-8">
        <div className="flex flex-col-reverse sm:flex-row sm:items-start gap-4">
          <input
            type="text"
            defaultValue={project.name}
            onBlur={e => e.target.value !== project.name && handleUpdateProject({ name: e.target.value })}
            className="text-2xl md:text-3xl font-bold text-gray-900 w-full mb-2 outline-none border-b border-transparent hover:border-gray-200 focus:border-blue-500 bg-transparent"
            placeholder="Nome do Projeto"
            aria-label="Nome do projeto"
          />
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={project.status}
              onChange={e => handleUpdateProject({ status: e.target.value as ProjectStatus })}
              className="text-sm border rounded p-1 bg-gray-50 outline-none"
              aria-label="Status do projeto"
            >
              <option value="active">Ativo</option>
              <option value="paused">Pausado</option>
              <option value="completed">Concluído</option>
              <option value="archived">Arquivado</option>
            </select>
            <button onClick={handleArchiveProject} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="Arquivar Projeto" aria-label="Arquivar projeto">
              <Archive size={18} />
            </button>
          </div>
        </div>

        <div className="flex gap-4 mb-6">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Atenção:</span>
            <select
              value={project.attentionLevel}
              onChange={e => handleUpdateProject({ attentionLevel: e.target.value as ProjectAttentionLevel })}
              className={`text-sm rounded p-0.5 font-medium outline-none ${
                project.attentionLevel === 'critical' ? 'text-red-700 bg-red-50' :
                project.attentionLevel === 'attention' ? 'text-orange-700 bg-orange-50' :
                'text-gray-700 bg-gray-50'
              }`}
              aria-label="Nível de atenção"
            >
              <option value="normal">Normal</option>
              <option value="attention">Requer Atenção</option>
              <option value="critical">Crítico</option>
            </select>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="proj-objective" className="block text-sm font-semibold text-gray-700 mb-1">Objetivo Geral</label>
            <textarea
              id="proj-objective"
              defaultValue={project.objective || ''}
              onBlur={e => e.target.value !== (project.objective || '') && handleUpdateProject({ objective: e.target.value })}
              className="w-full text-gray-700 text-sm p-2 outline-none border rounded hover:border-gray-300 focus:border-blue-500 resize-none"
              placeholder="Defina o que é o sucesso deste projeto..."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="proj-milestone" className="block text-sm font-semibold text-gray-700 mb-1">Próximo Marco</label>
              <input
                id="proj-milestone"
                type="text"
                defaultValue={project.nextMilestone || ''}
                onBlur={e => e.target.value !== (project.nextMilestone || '') && handleUpdateProject({ nextMilestone: e.target.value })}
                className="w-full text-sm p-2 outline-none border rounded hover:border-gray-300 focus:border-blue-500"
                placeholder="Ex: Entregar v1.0"
              />
            </div>
            <div>
              <label htmlFor="proj-due" className="block text-sm font-semibold text-gray-700 mb-1">Prazo do Projeto</label>
              <input
                id="proj-due"
                type="date"
                defaultValue={isoToDateInput(project.dueAt)}
                onChange={e => handleUpdateProject({ dueAt: dateInputToISO(e.target.value) })}
                className="w-full text-sm p-2 outline-none border rounded hover:border-gray-300 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Section title="Tarefas" icon={<CheckCircle size={18} className="text-green-600" />} items={tasks} itemCmds={itemCmds} showCheck />
          <Section title="Decisões" icon={<Target size={18} className="text-red-600" />} items={decisions} itemCmds={itemCmds} customClass="bg-red-50 border-red-100" />
        </div>
        <div className="space-y-6">
          <Section title="Ideias & Insights" icon={<Lightbulb size={18} className="text-yellow-500" />} items={[...ideas, ...insights]} itemCmds={itemCmds} />
          <Section title="Referências & Notas" icon={<FileText size={18} className="text-blue-500" />} items={references} itemCmds={itemCmds} />
          {archived.length > 0 && (
            <Section title="Arquivados" icon={<Archive size={18} className="text-gray-500" />} items={archived} itemCmds={itemCmds} />
          )}
        </div>
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  items: Item[];
  itemCmds: ItemCommands;
  showCheck?: boolean;
  customClass?: string;
}

function Section({ title, icon, items, itemCmds, showCheck = false, customClass = 'bg-white border-gray-200' }: SectionProps) {
  return (
    <div className={`rounded-xl shadow-sm border p-5 ${customClass}`}>
      <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
        {icon} {title} <span className="text-sm font-normal text-gray-500 ml-auto">{items.length} {items.length === 1 ? 'item' : 'itens'}</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500 italic">Nenhum item.</p>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
          {items.map(item => (
            <div key={item.id} className="p-3 bg-white border rounded-lg shadow-sm">
              <div className="flex gap-2 items-start">
                {showCheck && item.status !== 'completed' && (
                  <button onClick={() => itemCmds.completeItem(item.id)} className="text-gray-400 hover:text-green-600 shrink-0 mt-0.5" title="Concluir" aria-label={`Concluir ${item.title}`}>
                    <CheckCircle size={16} />
                  </button>
                )}
                {showCheck && item.status === 'completed' && (
                  <CheckCircle size={16} className="text-green-500 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${item.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                    {item.title}
                  </div>
                  {item.content && (
                    <div className="text-xs text-gray-500 mt-1 line-clamp-2">{item.content}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

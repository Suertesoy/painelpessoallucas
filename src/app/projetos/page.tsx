'use client';

import React, { useState, useMemo } from 'react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { useWorkspace } from '@/providers/auth.provider';
import { Folder, Plus, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import Link from 'next/link';

export default function ProjetosPage() {
  const { project: projectQueries, item: itemQueries } = useQueries();
  const { project: projectCmds } = useCommands();
  const { workspaceId } = useWorkspace();
  const { data: projects, isLoading } = useReactiveQuery(() => projectQueries.listProjects(), []);
  const { data: items } = useReactiveQuery(() => itemQueries.listItems(), []);

  const [isCreating, setIsCreating] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', objective: '' });
  const [filter, setFilter] = useState<'active' | 'paused' | 'completed' | 'archived'>('active');

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    return projects.filter(p => p.status === filter).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [projects, filter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject.name.trim()) return;
    
    await projectCmds.createProject({
      name: newProject.name.trim(),
      objective: newProject.objective.trim() || undefined,
      status: 'active',
      attentionLevel: 'normal'
    }, workspaceId);

    setNewProject({ name: '', objective: '' });
    setIsCreating(false);
  };

  const getOpenItemsCount = (projectId: string) => {
    if (!items) return 0;
    return items.filter(i => i.projectId === projectId && i.status !== 'completed' && i.status !== 'archived').length;
  };

  if (isLoading) {
    return <div className="p-4 md:p-8">Carregando projetos...</div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Folder className="text-blue-500" /> Projetos
          </h1>
          <p className="text-gray-600 mt-1">Gerencie seus objetivos de longo prazo.</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition"
        >
          <Plus size={20} /> Novo Projeto
        </button>
      </div>

      {isCreating && (
        <div className="bg-white p-6 rounded-xl border shadow-sm mb-8 animate-in fade-in slide-in-from-top-4">
          <h2 className="text-lg font-semibold mb-4">Criar Novo Projeto</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Projeto *</label>
              <input 
                type="text" 
                autoFocus
                value={newProject.name}
                onChange={e => setNewProject({ ...newProject, name: e.target.value })}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder="Ex: Reforma da Cozinha"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Objetivo (Opcional)</label>
              <textarea 
                value={newProject.objective}
                onChange={e => setNewProject({ ...newProject, objective: e.target.value })}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none resize-none" 
                placeholder="O que define o sucesso deste projeto?"
                rows={2}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Salvar</button>
              <button type="button" onClick={() => setIsCreating(false)} className="text-gray-600 px-4 py-2 hover:bg-gray-100 rounded">Cancelar</button>
            </div>
          </form>
        </div>
      )}

      <div className="flex gap-4 border-b mb-6 overflow-x-auto">
        <button 
          onClick={() => setFilter('active')} 
          className={`pb-2 px-1 border-b-2 font-medium ${filter === 'active' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Ativos
        </button>
        <button 
          onClick={() => setFilter('paused')} 
          className={`pb-2 px-1 border-b-2 font-medium ${filter === 'paused' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Pausados
        </button>
        <button 
          onClick={() => setFilter('completed')} 
          className={`pb-2 px-1 border-b-2 font-medium ${filter === 'completed' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Concluídos
        </button>
        <button 
          onClick={() => setFilter('archived')} 
          className={`pb-2 px-1 border-b-2 font-medium ${filter === 'archived' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Arquivados
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProjects.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-500 bg-gray-50 rounded-xl border border-dashed">
            Nenhum projeto encontrado nesta categoria.
          </div>
        ) : (
          filteredProjects.map(proj => (
            <Link key={proj.id} href={`/projetos/${proj.id}`} className="bg-white p-5 rounded-xl border shadow-sm hover:shadow-md transition-shadow group flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-1" title={proj.name}>
                  {proj.name}
                </h3>
                {proj.attentionLevel === 'critical' && <div title="Atenção Crítica"><AlertCircle size={18} className="text-red-500 shrink-0" /></div>}
                {proj.attentionLevel === 'attention' && <div title="Requer Atenção"><AlertCircle size={18} className="text-orange-500 shrink-0" /></div>}
              </div>
              
              <p className="text-sm text-gray-600 line-clamp-2 mb-4 flex-1">
                {proj.objective || 'Sem objetivo definido.'}
              </p>

              <div className="space-y-2 mt-auto">
                <div className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 p-2 rounded">
                  <span className="flex items-center gap-1"><CheckCircle size={14}/> Itens Abertos</span>
                  <span className="font-medium text-gray-900">{getOpenItemsCount(proj.id)}</span>
                </div>
                {proj.nextMilestone && (
                  <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 p-2 rounded">
                    <span className="font-semibold shrink-0">Marco:</span>
                    <span className="truncate">{proj.nextMilestone}</span>
                  </div>
                )}
                {proj.dueAt && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Clock size={14} /> Prazo: {new Date(proj.dueAt).toLocaleDateString('pt-BR')}
                  </div>
                )}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

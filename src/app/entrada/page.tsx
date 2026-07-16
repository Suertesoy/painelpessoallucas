'use client';

import React, { useState, useMemo } from 'react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { Item, ItemType } from '@/modules/items/domain/item.schema';
import { Project } from '@/modules/projects/domain/project.schema';
import { Search, Archive, CheckCircle, Tag, AlertCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';

export default function EntradaPage() {
  const { item: itemQueries, project: projectQueries } = useQueries();
  const { item: itemCmds } = useCommands();
  const { data: inboxItems, isLoading } = useReactiveQuery(() => itemQueries.listInboxItems(), []);
  const { data: projects } = useReactiveQuery(() => projectQueries.listProjects(), []);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<ItemType | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<'low' | 'normal' | 'high' | 'critical' | 'all'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    let items = inboxItems || [];

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(i => {
        const p = projects?.find(proj => proj.id === i.projectId);
        return (i.title && i.title.toLowerCase().includes(q)) ||
          (i.content && i.content.toLowerCase().includes(q)) ||
          (i.nextAction && i.nextAction.toLowerCase().includes(q)) ||
          (p && p.name.toLowerCase().includes(q));
      });
    }

    if (filterType !== 'all') {
      items = items.filter(i => i.type === filterType);
    }

    if (filterPriority !== 'all') {
      items = items.filter(i => i.priority === filterPriority);
    }

    // Ordenar do mais novo para o mais antigo
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [inboxItems, projects, search, filterType, filterPriority]);

  const handleArchive = async (id: string) => {
    if (confirm('Tem certeza que deseja arquivar este item?')) {
      await itemCmds.archiveItem(id);
    }
  };

  const handleComplete = async (id: string) => {
    await itemCmds.completeItem(id);
  };

  const handleOrganize = async (id: string) => {
    await itemCmds.updateItem(id, { status: 'organized' });
  };

  const handleUpdate = async (id: string, updates: Partial<Item>) => {
    await itemCmds.updateItem(id, updates);
  };

  if (isLoading) {
    return <div className="p-8">Carregando...</div>;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Caixa de Entrada</h1>
          <p className="text-gray-600">Processe ideias, tarefas e referências recém-capturadas.</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border mb-6 flex gap-4 items-end flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">Pesquisar na Entrada</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar título, projeto..."
              className="w-full pl-9 p-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="w-full p-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="all">Todos os tipos</option>
            <option value="note">Nota livre</option>
            <option value="task">Tarefa</option>
            <option value="idea">Ideia</option>
            <option value="insight">Insight</option>
            <option value="decision">Decisão</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Prioridade</label>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as any)}
            className="w-full p-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="all">Todas as prioridades</option>
            <option value="low">Baixa</option>
            <option value="normal">Normal</option>
            <option value="high">Alta</option>
            <option value="critical">Crítica</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white rounded-lg shadow-sm border">
        {filteredItems.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-gray-500">
            <CheckCircle size={48} className="text-gray-300 mb-4" />
            <p className="font-medium text-lg text-gray-600">Caixa de entrada vazia</p>
            <p className="text-sm">Você processou tudo com sucesso.</p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredItems.map(item => (
              <div key={item.id} className="p-4 hover:bg-gray-50 flex flex-col gap-3 group">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    {editingId === item.id ? (
                      <input 
                        type="text" 
                        defaultValue={item.title} 
                        onBlur={(e) => {
                          if (e.target.value !== item.title) handleUpdate(item.id, { title: e.target.value });
                          setEditingId(null);
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        className="font-medium text-lg w-full border-b focus:border-blue-500 outline-none"
                        autoFocus
                      />
                    ) : (
                      <h3 className="font-medium text-lg text-gray-900 cursor-text" onClick={() => setEditingId(item.id)}>
                        {item.title}
                      </h3>
                    )}
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded capitalize">
                        {item.type}
                      </span>
                      {item.priority === 'critical' && <span className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-0.5 rounded"><AlertCircle size={12}/> Crítica</span>}
                      {item.priority === 'high' && <span className="flex items-center gap-1 text-orange-600 bg-orange-50 px-2 py-0.5 rounded">Alta</span>}
                      
                      <select 
                        value={item.projectId || ''} 
                        onChange={(e) => handleUpdate(item.id, { projectId: e.target.value || undefined })}
                        className="bg-transparent hover:bg-gray-100 rounded px-1 outline-none text-gray-600"
                      >
                        <option value="">Sem projeto</option>
                        {projects?.map((p: Project) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>

                      <span>{format(parseISO(item.createdAt), "dd 'de' MMM, HH:mm", { locale: ptBR })}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {item.type === 'task' && (
                      <button onClick={() => handleComplete(item.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Concluir">
                        <CheckCircle size={18} />
                      </button>
                    )}
                    <button onClick={() => handleOrganize(item.id)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded text-sm font-medium" title="Remover da Entrada">
                      Organizar
                    </button>
                    <button onClick={() => handleArchive(item.id)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="Arquivar">
                      <Archive size={18} />
                    </button>
                  </div>
                </div>

                {item.content && (
                  <p className="text-gray-700 text-sm whitespace-pre-wrap">{item.content}</p>
                )}
                
                <div className="flex items-center gap-4 text-xs mt-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-500">Ação:</span>
                    <input 
                      type="text" 
                      defaultValue={item.nextAction || ''}
                      placeholder="Próxima ação..."
                      onBlur={(e) => handleUpdate(item.id, { nextAction: e.target.value })}
                      className="bg-transparent outline-none border-b border-transparent hover:border-gray-300 focus:border-blue-500 px-1 py-0.5 min-w-[200px]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-500">Agendado:</span>
                    <input 
                      type="date" 
                      defaultValue={item.scheduledAt ? item.scheduledAt.split('T')[0] : ''}
                      onChange={(e) => handleUpdate(item.id, { scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                      className="bg-transparent outline-none text-gray-600"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

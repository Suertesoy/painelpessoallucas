'use client';

import React, { useState, useMemo } from 'react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { ItemType, UpdateItemDTO } from '@/modules/items/domain/item.schema';
import { Lightbulb, Target, BookOpen, Search, Archive, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';

const KNOWLEDGE_TYPES: ItemType[] = ['idea', 'insight', 'decision', 'reference', 'note'];

type TypeFilter = ItemType | 'all';

export default function IdeiasPage() {
  const { item: itemQueries, project: projectQueries } = useQueries();
  const { item: itemCmds } = useCommands();

  const { data: items, isLoading: isLoadingItems } = useReactiveQuery(() => itemQueries.listItems(), []);
  const { data: projects, isLoading: isLoadingProjects } = useReactiveQuery(() => projectQueries.listProjects(), []);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<TypeFilter>('all');
  const [filterProject, setFilterProject] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    if (!items) return [];

    let filtered = items.filter(i => KNOWLEDGE_TYPES.includes(i.type) && i.status !== 'archived');

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(i =>
        (i.title && i.title.toLowerCase().includes(q)) ||
        (i.content && i.content.toLowerCase().includes(q))
      );
    }

    if (filterType !== 'all') {
      filtered = filtered.filter(i => i.type === filterType);
    }

    if (filterProject !== 'all') {
      filtered = filtered.filter(i => i.projectId === (filterProject === 'none' ? undefined : filterProject));
    }

    // Mais recentes primeiro
    return filtered.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [items, search, filterType, filterProject]);

  const handleArchive = async (id: string) => {
    if (confirm('Tem certeza que deseja arquivar este item?')) {
      await itemCmds.archiveItem(id);
    }
  };

  const handleUpdate = async (id: string, updates: UpdateItemDTO) => {
    await itemCmds.updateItem(id, updates);
  };

  if (isLoadingItems || isLoadingProjects) {
    return <div className="p-4 md:p-8 max-w-5xl mx-auto">Carregando...</div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <Lightbulb className="text-yellow-500" /> Ideias e Insights
        </h1>
        <p className="text-gray-600 mt-1">Conhecimento, referências e banco de decisões.</p>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border mb-6 flex gap-4 items-end flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="ideas-search" className="block text-xs font-medium text-gray-600 mb-1">Pesquisar</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              id="ideas-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar título, conteúdo..."
              className="w-full pl-9 p-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        <div>
          <label htmlFor="ideas-type" className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
          <select
            id="ideas-type"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as TypeFilter)}
            className="w-full p-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500 outline-none capitalize"
          >
            <option value="all">Todos</option>
            <option value="decision">Decisões</option>
            <option value="idea">Ideias</option>
            <option value="insight">Insights</option>
            <option value="reference">Referências</option>
            <option value="note">Notas Livres</option>
          </select>
        </div>

        <div>
          <label htmlFor="ideas-project" className="block text-xs font-medium text-gray-600 mb-1">Projeto</label>
          <select
            id="ideas-project"
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="w-full p-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="all">Todos</option>
            <option value="none">Sem Projeto</option>
            {projects?.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto space-y-4 pb-10">
        {filteredItems.length === 0 ? (
          <div className="text-center py-20 text-gray-500 bg-white rounded-lg border shadow-sm">
            Nenhum item encontrado.
          </div>
        ) : (
          filteredItems.map(item => {
            const isDecision = item.type === 'decision';
            const proj = projects?.find(p => p.id === item.projectId);

            return (
              <div
                key={item.id}
                className={`p-5 rounded-xl border shadow-sm ${
                  isDecision ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200 hover:shadow-md'
                }`}
              >
                <div className="flex justify-between items-start mb-2 gap-2">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {isDecision && <Target className="text-red-600 shrink-0" size={24} />}
                    {item.type === 'idea' && <Lightbulb className="text-yellow-500 shrink-0" size={20} />}
                    {item.type === 'reference' && <BookOpen className="text-blue-500 shrink-0" size={20} />}

                    {editingId === item.id ? (
                      <input
                        type="text"
                        defaultValue={item.title}
                        onBlur={(e) => {
                          if (e.target.value !== item.title) handleUpdate(item.id, { title: e.target.value });
                          setEditingId(null);
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        className={`font-bold text-lg w-full border-b focus:border-blue-500 outline-none bg-transparent ${isDecision ? 'text-red-900 border-red-300' : 'text-gray-900'}`}
                        autoFocus
                      />
                    ) : (
                      <h3
                        className={`font-bold text-lg cursor-text truncate ${isDecision ? 'text-red-900' : 'text-gray-900'}`}
                        onClick={() => setEditingId(item.id)}
                        title="Clique para editar o título"
                      >
                        {item.title}
                      </h3>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-500 capitalize bg-white/50 px-2 py-1 rounded">
                      {format(parseISO(item.createdAt), 'dd MMM yyyy', { locale: ptBR })}
                    </span>
                    <button onClick={() => handleArchive(item.id)} className="text-gray-400 hover:text-red-600 p-1" title="Arquivar" aria-label={`Arquivar ${item.title}`}>
                      <Archive size={16} />
                    </button>
                  </div>
                </div>

                <div className="pl-0 sm:pl-9 pr-0 sm:pr-4">
                  {editingId === `content-${item.id}` ? (
                    <textarea
                      defaultValue={item.content || ''}
                      onBlur={(e) => {
                        if (e.target.value !== item.content) handleUpdate(item.id, { content: e.target.value });
                        setEditingId(null);
                      }}
                      className="w-full text-sm bg-white/50 p-2 rounded outline-none resize-y min-h-[100px] border border-blue-200 focus:border-blue-500"
                      autoFocus
                    />
                  ) : (
                    <div
                      className={`text-sm mb-4 cursor-text whitespace-pre-wrap ${isDecision ? 'text-red-800 font-medium' : 'text-gray-700'}`}
                      onClick={() => setEditingId(`content-${item.id}`)}
                      title="Clique para editar o conteúdo"
                    >
                      {item.content || <span className="italic opacity-50">Clique para adicionar conteúdo...</span>}
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs mt-4 flex-wrap">
                    {proj && (
                      <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded border">
                        Projeto: {proj.name}
                      </span>
                    )}
                    {item.source !== 'manual' && (
                      <span className="text-gray-500 flex items-center gap-1">
                        <AlertTriangle size={12}/> {item.source}
                      </span>
                    )}
                    {isDecision && item.nextAction && (
                      <span className="text-red-700 bg-red-100 px-2 py-1 rounded font-medium">
                        Impacto: {item.nextAction}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

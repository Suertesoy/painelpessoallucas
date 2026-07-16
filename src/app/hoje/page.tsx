'use client';

import React, { useState, useMemo } from 'react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { CheckCircle, AlertCircle, Clock, Layout, Target, Plus, X } from 'lucide-react';
import Link from 'next/link';

export default function HojePage() {
  const { item: itemQueries, project: projectQueries, dailyPlan: dailyPlanQueries } = useQueries();
  const { item: itemCmds, dailyPlan: dailyPlanCmds } = useCommands();
  const todayDateStr = new Date().toISOString().split('T')[0];

  const { data: todayOverview } = useReactiveQuery(() => itemQueries.getTodayOverview(todayDateStr), []);
  const { data: reviewOverview } = useReactiveQuery(() => itemQueries.getReviewOverview(), []);
  const { data: projects } = useReactiveQuery(() => projectQueries.listProjects(), []);
  const { data: dailyPlan } = useReactiveQuery(() => dailyPlanQueries.getDailyPlan(todayDateStr), []);
  const { data: allItems } = useReactiveQuery(() => itemQueries.listItems(), []);

  const [isAddingFocus, setIsAddingFocus] = useState(false);
  const [focusSelectId, setFocusSelectId] = useState('');

  const focusItems = useMemo(() => {
    if (!dailyPlan || !allItems) return [];
    return dailyPlan.focusItemIds.map(id => allItems.find(i => i.id === id)).filter(Boolean) as any[];
  }, [dailyPlan, allItems]);

  const activeTasks = useMemo(() => {
    return allItems?.filter(i => i.type === 'task' && i.status !== 'completed' && i.status !== 'archived') || [];
  }, [allItems]);

  const activeProjects = useMemo(() => {
    return projects?.filter(p => p.status === 'active') || [];
  }, [projects]);

  const handleAddFocus = async () => {
    if (!focusSelectId) return;
    const currentFocus = dailyPlan?.focusItemIds || [];
    if (currentFocus.length >= 3) {
      alert("No máximo 3 itens no foco diário.");
      return;
    }
    if (currentFocus.includes(focusSelectId)) return;

    await dailyPlanCmds.setDailyFocus('ws-1', todayDateStr, [...currentFocus, focusSelectId]);
    setFocusSelectId('');
    setIsAddingFocus(false);
  };

  const handleRemoveFocus = async (id: string) => {
    await dailyPlanCmds.removeDailyFocusItem('ws-1', todayDateStr, id);
  };

  const handleCompleteItem = async (id: string) => {
    await itemCmds.completeItem(id);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto h-full overflow-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Hoje</h1>
        <p className="text-gray-600 capitalize">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Coluna Principal */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Foco do Dia */}
          <section className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2"><Target className="text-blue-500" /> Foco do Dia</h2>
              <span className="text-sm text-gray-500">{focusItems.length}/3</span>
            </div>
            
            <div className="space-y-3">
              {focusItems.length === 0 ? (
                <div className="text-gray-500 text-sm text-center py-4 bg-gray-50 rounded-lg border border-dashed">
                  Nenhum foco definido para hoje.
                </div>
              ) : (
                focusItems.map(item => (
                  <div key={item.id} className="flex justify-between items-start p-3 border rounded-lg bg-blue-50/30 group">
                    <div className="flex-1">
                      <div className="font-medium">{item.title}</div>
                      {item.nextAction && <div className="text-xs text-gray-500 mt-1">Ação: {item.nextAction}</div>}
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {item.type === 'task' && item.status !== 'completed' && (
                        <button onClick={() => handleCompleteItem(item.id)} className="text-green-600 hover:bg-green-100 p-1 rounded" title="Concluir">
                          <CheckCircle size={16} />
                        </button>
                      )}
                      <button onClick={() => handleRemoveFocus(item.id)} className="text-red-500 hover:bg-red-50 p-1 rounded" title="Remover do foco">
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}

              {focusItems.length < 3 && !isAddingFocus && (
                <button 
                  onClick={() => setIsAddingFocus(true)}
                  className="w-full text-left p-3 text-sm text-gray-500 hover:bg-gray-50 border border-dashed rounded-lg flex items-center gap-2"
                >
                  <Plus size={16} /> Adicionar ao Foco
                </button>
              )}

              {isAddingFocus && (
                <div className="flex gap-2">
                  <select 
                    value={focusSelectId} 
                    onChange={e => setFocusSelectId(e.target.value)}
                    className="flex-1 border p-2 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Selecione um item (priorize tarefas ativas)</option>
                    {activeTasks.filter(t => !focusItems.some(f => f.id === t.id)).map(task => (
                      <option key={task.id} value={task.id}>{task.title}</option>
                    ))}
                  </select>
                  <button onClick={handleAddFocus} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">Salvar</button>
                  <button onClick={() => setIsAddingFocus(false)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded text-sm">Cancelar</button>
                </div>
              )}
            </div>
          </section>

          {/* Próximas Ações */}
          <section className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-xl font-bold flex items-center gap-2 mb-4"><CheckCircle className="text-green-500" /> Próximas Ações (Tarefas)</h2>
            <div className="space-y-2 max-h-96 overflow-auto pr-2">
              {activeTasks.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhuma tarefa aberta.</p>
              ) : (
                activeTasks
                  .sort((a, b) => {
                    // Priorizar agendados de hoje e prioridade
                    if (a.scheduledAt && a.scheduledAt.startsWith(todayDateStr) && !(b.scheduledAt && b.scheduledAt.startsWith(todayDateStr))) return -1;
                    if (b.scheduledAt && b.scheduledAt.startsWith(todayDateStr) && !(a.scheduledAt && a.scheduledAt.startsWith(todayDateStr))) return 1;
                    const pMap: Record<string, number> = { critical: 4, high: 3, normal: 2, low: 1 };
                    return (pMap[b.priority] || 0) - (pMap[a.priority] || 0);
                  })
                  .slice(0, 10)
                  .map(task => (
                    <div key={task.id} className="flex justify-between items-center p-3 hover:bg-gray-50 border-b last:border-0 group">
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          {task.title}
                          {task.priority === 'critical' && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Crítica</span>}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {projects?.find(p => p.id === task.projectId)?.name || 'Sem Projeto'}
                        </div>
                      </div>
                      <button onClick={() => handleCompleteItem(task.id)} className="opacity-0 group-hover:opacity-100 text-green-600 p-1.5 hover:bg-green-50 rounded transition-opacity">
                        <CheckCircle size={18} />
                      </button>
                    </div>
                  ))
              )}
            </div>
          </section>

        </div>

        {/* Coluna Secundária */}
        <div className="space-y-6">
          
          {/* Linha do Tempo */}
          <section className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><Clock className="text-purple-500" /> Linha do Tempo</h2>
            <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
              {todayOverview?.scheduled.length === 0 ? (
                <p className="text-gray-500 text-sm ml-6">Nada agendado para hoje.</p>
              ) : (
                todayOverview?.scheduled.map((item, idx) => (
                  <div key={item.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-4 h-4 rounded-full border border-white bg-purple-500 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 absolute left-0 md:left-1/2"></div>
                    <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] ml-6 md:ml-0 bg-white p-3 rounded shadow-sm border text-sm">
                      <div className="font-medium text-gray-900 truncate">{item.title}</div>
                      <div className="text-xs text-gray-500">{format(parseISO(item.scheduledAt!), 'HH:mm')}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Atenção Necessária */}
          <section className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><AlertCircle className="text-red-500" /> Atenção Necessária</h2>
            <div className="space-y-2 text-sm">
              {reviewOverview?.overdue.length ? (
                <div className="p-2 bg-red-50 text-red-800 rounded">
                  <span className="font-bold">{reviewOverview.overdue.length}</span> item(s) com prazo estourado.
                </div>
              ) : null}
              {reviewOverview?.blocked.length ? (
                <div className="p-2 bg-orange-50 text-orange-800 rounded">
                  <span className="font-bold">{reviewOverview.blocked.length}</span> item(s) bloqueados.
                </div>
              ) : null}
              {reviewOverview?.oldInbox.length ? (
                <div className="p-2 bg-yellow-50 text-yellow-800 rounded">
                  <span className="font-bold">{reviewOverview.oldInbox.length}</span> item(s) na Inbox &gt; 30 dias.
                </div>
              ) : null}
              
              {!reviewOverview?.overdue.length && !reviewOverview?.blocked.length && !reviewOverview?.oldInbox.length && (
                <p className="text-gray-500">Tudo sob controle.</p>
              )}
            </div>
          </section>

          {/* Pulso dos Projetos */}
          <section className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><Layout className="text-indigo-500" /> Pulso dos Projetos</h2>
            <div className="space-y-3">
              {activeProjects.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhum projeto ativo.</p>
              ) : (
                activeProjects.slice(0, 5).map(proj => (
                  <Link key={proj.id} href={`/projetos/${proj.id}`} className="block p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-medium text-sm text-gray-900 truncate">{proj.name}</div>
                      {proj.attentionLevel === 'critical' && <AlertCircle size={14} className="text-red-500 shrink-0" />}
                    </div>
                    {proj.nextMilestone ? (
                      <div className="text-xs text-gray-500 truncate">Próx: {proj.nextMilestone}</div>
                    ) : (
                      <div className="text-xs text-orange-500">Sem próximo marco definido</div>
                    )}
                  </Link>
                ))
              )}
              {activeProjects.length > 5 && (
                <Link href="/projetos" className="text-sm text-blue-600 hover:underline block text-center mt-2">
                  Ver todos os {activeProjects.length} projetos
                </Link>
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

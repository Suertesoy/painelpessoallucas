'use client';

import React, { useState, useMemo } from 'react';
import { useReactiveQuery, useMounted } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { Item } from '@/modules/items/domain/item.schema';
import { useWorkspace } from '@/providers/auth.provider';
import { todayDateStr } from '@/lib/dates';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { CheckCircle, AlertCircle, Clock, Layout, Target, Plus, X } from 'lucide-react';
import Link from 'next/link';

const PRIORITY_ORDER: Record<string, number> = { critical: 4, high: 3, normal: 2, low: 1 };

export default function HojePage() {
  const { item: itemQueries, project: projectQueries, dailyPlan: dailyPlanQueries } = useQueries();
  const { item: itemCmds, dailyPlan: dailyPlanCmds } = useCommands();
  const { workspaceId } = useWorkspace();
  const mounted = useMounted();
  const today = todayDateStr();

  const { data: todayOverview } = useReactiveQuery(() => itemQueries.getTodayOverview(today), [today]);
  const { data: reviewOverview } = useReactiveQuery(() => itemQueries.getReviewOverview(), []);
  const { data: projects } = useReactiveQuery(() => projectQueries.listProjects(), []);
  const { data: dailyPlan } = useReactiveQuery(() => dailyPlanQueries.getDailyPlan(today), [today]);
  const { data: allItems } = useReactiveQuery(() => itemQueries.listItems(), []);

  const [isAddingFocus, setIsAddingFocus] = useState(false);
  const [focusSelectId, setFocusSelectId] = useState('');
  const [focusError, setFocusError] = useState('');

  const focusItems = useMemo<Item[]>(() => {
    if (!dailyPlan || !allItems) return [];
    return dailyPlan.focusItemIds
      .map(id => allItems.find(i => i.id === id))
      .filter((i): i is Item => Boolean(i));
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
      setFocusError('No máximo 3 itens no foco diário.');
      return;
    }
    if (currentFocus.includes(focusSelectId)) return;

    try {
      await dailyPlanCmds.setDailyFocus(workspaceId, today, [...currentFocus, focusSelectId]);
      setFocusSelectId('');
      setFocusError('');
      setIsAddingFocus(false);
    } catch (err) {
      setFocusError(err instanceof Error ? err.message : 'Erro ao definir foco');
    }
  };

  const handleRemoveFocus = async (id: string) => {
    await dailyPlanCmds.removeDailyFocusItem(workspaceId, today, id);
  };

  const handleCompleteItem = async (id: string) => {
    await itemCmds.completeItem(id);
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Hoje</h1>
        {/* A data real só é conhecida no cliente; evita mismatch de hidratação */}
        <p className="text-gray-600 capitalize min-h-6">
          {mounted ? format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR }) : ''}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Coluna Principal */}
        <div className="lg:col-span-2 space-y-6">

          {/* Foco do Dia */}
          <section className="bg-white rounded-xl shadow-sm border p-4 md:p-6">
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
                  <div key={item.id} className="flex justify-between items-start p-3 border rounded-lg bg-blue-50/30">
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium ${item.status === 'completed' ? 'line-through text-gray-400' : ''}`}>{item.title}</div>
                      {item.nextAction && <div className="text-xs text-gray-500 mt-1">Ação: {item.nextAction}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      {item.type === 'task' && item.status !== 'completed' && (
                        <button onClick={() => handleCompleteItem(item.id)} className="text-green-600 hover:bg-green-100 p-1 rounded" title="Concluir" aria-label={`Concluir ${item.title}`}>
                          <CheckCircle size={16} />
                        </button>
                      )}
                      <button onClick={() => handleRemoveFocus(item.id)} className="text-red-500 hover:bg-red-50 p-1 rounded" title="Remover do foco" aria-label={`Remover ${item.title} do foco`}>
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}

              {focusError && <p className="text-sm text-red-600" role="alert">{focusError}</p>}

              {focusItems.length < 3 && !isAddingFocus && (
                <button
                  onClick={() => setIsAddingFocus(true)}
                  className="w-full text-left p-3 text-sm text-gray-500 hover:bg-gray-50 border border-dashed rounded-lg flex items-center gap-2"
                >
                  <Plus size={16} /> Adicionar ao Foco
                </button>
              )}

              {isAddingFocus && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={focusSelectId}
                    onChange={e => setFocusSelectId(e.target.value)}
                    className="flex-1 border p-2 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    aria-label="Selecionar item para o foco"
                  >
                    <option value="">Selecione um item (priorize tarefas ativas)</option>
                    {activeTasks.filter(t => !focusItems.some(f => f.id === t.id)).map(task => (
                      <option key={task.id} value={task.id}>{task.title}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button onClick={handleAddFocus} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">Salvar</button>
                    <button onClick={() => { setIsAddingFocus(false); setFocusError(''); }} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded text-sm">Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Próximas Ações */}
          <section className="bg-white rounded-xl shadow-sm border p-4 md:p-6">
            <h2 className="text-xl font-bold flex items-center gap-2 mb-4"><CheckCircle className="text-green-500" /> Próximas Ações (Tarefas)</h2>
            <div className="space-y-2 max-h-96 overflow-auto pr-2">
              {activeTasks.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhuma tarefa aberta.</p>
              ) : (
                activeTasks
                  .slice()
                  .sort((a, b) => {
                    // Priorizar agendados de hoje, depois prioridade
                    const aToday = a.scheduledAt?.startsWith(today) ?? false;
                    const bToday = b.scheduledAt?.startsWith(today) ?? false;
                    if (aToday !== bToday) return aToday ? -1 : 1;
                    return (PRIORITY_ORDER[b.priority] || 0) - (PRIORITY_ORDER[a.priority] || 0);
                  })
                  .slice(0, 10)
                  .map(task => (
                    <div key={task.id} className="flex justify-between items-center p-3 hover:bg-gray-50 border-b last:border-0">
                      <div className="min-w-0">
                        <div className="font-medium text-sm flex items-center gap-2">
                          <span className="truncate">{task.title}</span>
                          {task.priority === 'critical' && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded shrink-0">Crítica</span>}
                          {task.priority === 'high' && <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded shrink-0">Alta</span>}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {projects?.find(p => p.id === task.projectId)?.name || 'Sem Projeto'}
                        </div>
                      </div>
                      <button onClick={() => handleCompleteItem(task.id)} className="text-gray-300 hover:text-green-600 p-1.5 hover:bg-green-50 rounded transition-colors shrink-0" title="Concluir" aria-label={`Concluir ${task.title}`}>
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
          <section className="bg-white rounded-xl shadow-sm border p-4 md:p-6">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><Clock className="text-purple-500" /> Agendado para Hoje</h2>
            {todayOverview?.scheduled.length === 0 ? (
              <p className="text-gray-500 text-sm">Nada agendado para hoje.</p>
            ) : (
              <ol className="space-y-3 border-l-2 border-purple-200 pl-4">
                {todayOverview?.scheduled.map(item => (
                  <li key={item.id} className="relative">
                    <span className="absolute -left-[1.35rem] top-1.5 w-2.5 h-2.5 rounded-full bg-purple-500" aria-hidden="true" />
                    <div className="text-xs font-bold text-purple-700">{format(parseISO(item.scheduledAt!), 'HH:mm')}</div>
                    <div className="text-sm font-medium text-gray-900 truncate">{item.title}</div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Atenção Necessária */}
          <section className="bg-white rounded-xl shadow-sm border p-4 md:p-6">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><AlertCircle className="text-red-500" /> Atenção Necessária</h2>
            <div className="space-y-2 text-sm">
              {reviewOverview?.overdue.length ? (
                <Link href="/revisao" className="block p-2 bg-red-50 text-red-800 rounded hover:bg-red-100">
                  <span className="font-bold">{reviewOverview.overdue.length}</span> item(s) com prazo estourado.
                </Link>
              ) : null}
              {reviewOverview?.blocked.length ? (
                <Link href="/revisao" className="block p-2 bg-orange-50 text-orange-800 rounded hover:bg-orange-100">
                  <span className="font-bold">{reviewOverview.blocked.length}</span> item(s) bloqueados.
                </Link>
              ) : null}
              {reviewOverview?.oldInbox.length ? (
                <Link href="/revisao" className="block p-2 bg-yellow-50 text-yellow-800 rounded hover:bg-yellow-100">
                  <span className="font-bold">{reviewOverview.oldInbox.length}</span> item(s) na Inbox &gt; 30 dias.
                </Link>
              ) : null}

              {!reviewOverview?.overdue.length && !reviewOverview?.blocked.length && !reviewOverview?.oldInbox.length && (
                <p className="text-gray-500">Tudo sob controle.</p>
              )}
            </div>
          </section>

          {/* Pulso dos Projetos */}
          <section className="bg-white rounded-xl shadow-sm border p-4 md:p-6">
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

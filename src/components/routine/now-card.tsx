'use client';

import { ArrowRightCircle, CalendarPlus, ExternalLink } from 'lucide-react';
import type { Item } from '@/modules/items/domain/item.schema';
import type { RoutineBlock } from '@/modules/routine/domain/routine.schema';
import type { LoadSummary } from '@/modules/routine/domain/routine-engine';
import { formatMinutes } from '@/lib/capacity';
import { ItemCompleteButton } from '@/components/item-complete-button';

interface LearningSummary {
  minutesStudied: number;
  goalMinutes: number;
  goalMet: boolean;
}

export interface NowCardProps {
  mounted: boolean;
  isBusinessDay: boolean;
  currentBlock: RoutineBlock | null;
  nextBlock: RoutineBlock | null;
  roleProjectName: string | null;
  hasRoleAssignment: boolean;
  tasks: Item[];
  load: LoadSummary | null;
  minutesRemaining: number;
  learningSummary: LearningSummary | null;
  canMoveToNextCompatibleBlock: boolean;
  onComplete: (id: string) => Promise<unknown>;
  onMoveNextCompatibleBlock: (item: Item) => void;
  onMoveNextBusinessDay: (item: Item) => void;
  onOpenDetail: (id: string) => void;
}

/**
 * "O que eu deveria estar fazendo agora" — o elemento de maior peso da Home.
 * Nunca soma seções concorrentes: um único bloco, uma única lista.
 */
export function NowCard({
  mounted,
  isBusinessDay,
  currentBlock,
  nextBlock,
  roleProjectName,
  hasRoleAssignment,
  tasks,
  load,
  minutesRemaining,
  learningSummary,
  canMoveToNextCompatibleBlock,
  onComplete,
  onMoveNextCompatibleBlock,
  onMoveNextBusinessDay,
  onOpenDetail,
}: NowCardProps) {
  if (!mounted) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="h-24 animate-pulse rounded-lg bg-gray-100" aria-hidden="true" />
      </section>
    );
  }

  if (!currentBlock) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Agora</p>
        <p className="mt-2 text-lg text-gray-600">
          {isBusinessDay ? 'Fora do período de rotina.' : 'Sem rotina de trabalho no fim de semana.'}
        </p>
        {isBusinessDay && nextBlock && (
          <p className="mt-1 text-sm text-gray-400">
            Próximo: {nextBlock.label} às {nextBlock.startTime}
          </p>
        )}
      </section>
    );
  }

  const isWorkBlock = currentBlock.role === 'deep_work_primary' || currentBlock.role === 'deep_work_secondary';
  const isBuffer = currentBlock.role === 'buffer';
  const isLearning = currentBlock.role === 'learning';
  const isRest = currentBlock.role === 'break' || currentBlock.role === 'lunch';

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Agora</p>
        <p className="text-sm text-gray-400">até {currentBlock.endTime}</p>
      </div>

      <h2 className="mt-1 text-2xl font-bold text-gray-900">{currentBlock.label}</h2>

      {isWorkBlock && (
        roleProjectName ? (
          <p className="text-base text-gray-600">{roleProjectName}</p>
        ) : (
          <p className="text-sm text-amber-600">
            Nenhum projeto definido para este papel —{' '}
            <a href="/configuracoes#rotina" className="underline">configurar em Configurações</a>.
          </p>
        )
      )}

      {isLearning && learningSummary && (
        <p className="text-base text-gray-600">
          {learningSummary.minutesStudied} min de {learningSummary.goalMinutes} min
          {learningSummary.goalMet && <span className="ml-1 text-emerald-600">· meta concluída</span>}
        </p>
      )}
      {isLearning && !learningSummary && (
        <p className="text-base text-gray-600">Meta mínima: 30 min</p>
      )}

      {isRest && <p className="text-sm text-gray-400">Sem tarefas neste intervalo.</p>}

      {isWorkBlock && hasRoleAssignment && (
        <div className="mt-4 space-y-2">
          {tasks.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-3 text-center text-sm text-gray-500">
              Nenhuma tarefa de {roleProjectName ?? 'projeto'} para agora.
            </p>
          ) : (
            tasks.map((item) => {
              const isDone = item.status === 'completed';
              return (
                <div key={item.id} className="flex items-start justify-between gap-2 rounded-lg border p-3">
                  <button
                    type="button"
                    onClick={() => onOpenDetail(item.id)}
                    className={`min-w-0 flex-1 text-left text-sm font-medium hover:underline ${
                      isDone ? 'text-gray-400 line-through' : 'text-gray-900'
                    }`}
                  >
                    {item.title}
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <ItemCompleteButton
                      itemId={item.id}
                      title={item.title ?? 'tarefa'}
                      isCompleted={isDone}
                      onComplete={onComplete}
                    />
                    {!isDone && canMoveToNextCompatibleBlock && (
                      <button
                        type="button"
                        onClick={() => onMoveNextCompatibleBlock(item)}
                        title="Mover para próximo bloco compatível"
                        aria-label={`Mover ${item.title} para o próximo bloco compatível`}
                        className="rounded p-1.5 text-blue-600 hover:bg-blue-50"
                      >
                        <ArrowRightCircle size={16} />
                      </button>
                    )}
                    {!isDone && (
                      <button
                        type="button"
                        onClick={() => onMoveNextBusinessDay(item)}
                        title="Mover para o próximo dia útil"
                        aria-label={`Mover ${item.title} para o próximo dia útil`}
                        className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
                      >
                        <CalendarPlus size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenDetail(item.id)}
                      title="Abrir detalhes"
                      aria-label={`Abrir detalhes de ${item.title}`}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100"
                    >
                      <ExternalLink size={16} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
          {load && tasks.length > 0 && (
            <p className={`text-xs ${load.overCapacity ? 'font-medium text-amber-600' : 'text-gray-400'}`}>
              {tasks.length} tarefa(s) · {formatMinutes(load.plannedMinutes)} planejado
              {load.overCapacity && ` · ${formatMinutes(load.overMinutes)} além da capacidade do bloco`}
            </p>
          )}
        </div>
      )}

      {isBuffer && (
        tasks.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 py-3 text-center text-sm text-gray-500">
            Capacidade de segurança — mova tarefas aqui manualmente, se precisar.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {tasks.map((item) => {
              const isDone = item.status === 'completed';
              return (
                <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <button
                    type="button"
                    onClick={() => onOpenDetail(item.id)}
                    className={`min-w-0 flex-1 text-left text-sm font-medium hover:underline ${
                      isDone ? 'text-gray-400 line-through' : 'text-gray-900'
                    }`}
                  >
                    {item.title}
                  </button>
                  <ItemCompleteButton
                    itemId={item.id}
                    title={item.title ?? 'tarefa'}
                    isCompleted={isDone}
                    onComplete={onComplete}
                  />
                </div>
              );
            })}
          </div>
        )
      )}

      <div className="mt-4 flex items-baseline justify-between">
        <p className="text-sm font-medium text-gray-500">{formatMinutes(minutesRemaining)} restante</p>
        {nextBlock && <p className="text-xs text-gray-400">Próximo: {nextBlock.label}</p>}
      </div>
    </section>
  );
}

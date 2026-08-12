'use client';

import { CalendarPlus, ExternalLink, Hourglass } from 'lucide-react';
import type { Item } from '@/modules/items/domain/item.schema';
import type { PendingGroup } from '@/modules/routine/domain/routine-engine';
import { formatMinutes } from '@/lib/capacity';
import { ItemCompleteButton } from '@/components/item-complete-button';

export interface PendingItemsCardProps {
  groups: PendingGroup<Item>[];
  onComplete: (id: string) => Promise<unknown>;
  onBringToToday: (item: Item) => void;
  onOpenDetail: (id: string) => void;
}

/**
 * Só pendências de execução (agendamento/prazo já vencido), agrupadas por
 * origem — nunca a lista completa de itens abertos do sistema (essa fica em
 * /revisao).
 */
export function PendingItemsCard({ groups, onComplete, onBringToToday, onOpenDetail }: PendingItemsCardProps) {
  const totalTasks = groups.reduce((sum, g) => sum + g.tasks.length, 0);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-500">
        <Hourglass size={15} /> Pendências
      </h3>

      {totalTasks === 0 ? (
        <p className="mt-2 text-sm text-gray-400">Nada pendente de dias anteriores.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {groups.map((group) => (
            <div key={group.originDateStr}>
              <p className="text-xs font-medium text-gray-400">
                Adiado de {group.label} · {group.tasks.length} tarefa(s) · {formatMinutes(group.totalMinutes)}
              </p>
              <div className="mt-1.5 space-y-1.5">
                {group.tasks.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                    <button
                      type="button"
                      onClick={() => onOpenDetail(item.id)}
                      className="min-w-0 flex-1 text-left text-sm font-medium text-gray-900 hover:underline"
                    >
                      {item.title}
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <ItemCompleteButton
                        itemId={item.id}
                        title={item.title ?? 'tarefa'}
                        isCompleted={false}
                        onComplete={onComplete}
                      />
                      <button
                        type="button"
                        onClick={() => onBringToToday(item)}
                        title="Trazer para hoje"
                        aria-label={`Trazer ${item.title} para hoje`}
                        className="rounded p-1.5 text-blue-600 hover:bg-blue-50"
                      >
                        <CalendarPlus size={16} />
                      </button>
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
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

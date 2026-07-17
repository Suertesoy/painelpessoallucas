import type { Item } from '@/modules/items/domain/item.schema';

/**
 * Cálculo de tempo comprometido e capacidade do dia.
 * Compromissos sobrepostos são mesclados — nunca contam duas vezes.
 */

export const DAY_CAPACITY_MINUTES = 8 * 60; // jornada padrão de 8h

export interface TimeInterval {
  startMs: number;
  endMs: number;
}

/** Mescla intervalos sobrepostos e retorna o total em minutos. */
export function mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  const sorted = [...intervals]
    .filter((i) => i.endMs > i.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  const merged: TimeInterval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, interval.endMs);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

export function totalMinutes(intervals: TimeInterval[]): number {
  return Math.round(
    mergeIntervals(intervals).reduce((sum, i) => sum + (i.endMs - i.startMs), 0) / 60000
  );
}

export interface CapacityInput {
  /** Blocos ocupados do Google Calendar (ISO). */
  busyBlocks: { start: string; end: string }[];
  /** Itens agendados de hoje (scheduled_at + estimated_minutes). */
  scheduledItems: Pick<Item, 'scheduledAt' | 'estimatedMinutes'>[];
  /** Itens de foco sem horário (somam estimativa, sem sobreposição). */
  unscheduledFocusItems: Pick<Item, 'estimatedMinutes'>[];
}

export interface CapacitySummary {
  committedMinutes: number;
  capacityMinutes: number;
  remainingMinutes: number;
  overCapacity: boolean;
}

export function computeCapacity(input: CapacityInput): CapacitySummary {
  const intervals: TimeInterval[] = [];

  for (const block of input.busyBlocks) {
    intervals.push({
      startMs: new Date(block.start).getTime(),
      endMs: new Date(block.end).getTime(),
    });
  }
  for (const item of input.scheduledItems) {
    if (!item.scheduledAt) continue;
    const startMs = new Date(item.scheduledAt).getTime();
    intervals.push({ startMs, endMs: startMs + (item.estimatedMinutes ?? 30) * 60000 });
  }

  // Sobreposições (inclusive item × compromisso do Calendar) contam uma vez.
  const scheduledTotal = totalMinutes(intervals);
  const unscheduledTotal = input.unscheduledFocusItems.reduce(
    (sum, i) => sum + (i.estimatedMinutes ?? 30),
    0
  );

  const committed = scheduledTotal + unscheduledTotal;
  return {
    committedMinutes: committed,
    capacityMinutes: DAY_CAPACITY_MINUTES,
    remainingMinutes: DAY_CAPACITY_MINUTES - committed,
    overCapacity: committed > DAY_CAPACITY_MINUTES,
  };
}

/** Formata minutos como "3h45". */
export function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}min`;
  return m === 0 ? `${sign}${h}h` : `${sign}${h}h${String(m).padStart(2, '0')}`;
}

/** Próximo horário livre de hoje com duração suficiente (sugestão simples). */
export function suggestFreeSlot(
  busy: TimeInterval[],
  dayStartMs: number,
  dayEndMs: number,
  durationMinutes: number
): number | null {
  const merged = mergeIntervals(busy);
  let cursor = dayStartMs;
  for (const block of merged) {
    if (block.startMs - cursor >= durationMinutes * 60000) {
      return cursor;
    }
    cursor = Math.max(cursor, block.endMs);
  }
  if (dayEndMs - cursor >= durationMinutes * 60000) return cursor;
  return null;
}

/** Rótulo da origem de um item (fonte visível na tela Hoje). */
export function itemSourceLabel(item: Item): string | null {
  if (item.recurrenceRuleId) return 'Recorrente';
  if (item.executionPlanId) return 'Plano';
  if (item.source === 'ai') return 'IA';
  if (item.source === 'quick_capture') return 'Captura';
  if (item.source === 'automation') return 'Automação';
  if (item.source === 'import') return 'Importado';
  if (item.source === 'integration') return 'Integração';
  return null;
}

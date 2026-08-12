/**
 * Motor determinístico da rotina diária.
 *
 * Funções puras: mesmos parâmetros → mesmo resultado, sempre. O "agora" é
 * sempre parâmetro (nunca `new Date()` interno), para ser testável e para
 * que a UI controle quando reavaliar. Timezone fixo América/São Paulo,
 * reaproveitando as mesmas convenções de fuso de
 * `@/modules/plans/domain/recurrence-engine`.
 *
 * Segunda a sexta têm rotina; sábado e domingo NUNCA geram blocos de
 * trabalho padrão (regra explícita do produto).
 */
import { addDaysToDateStr, zonedDateTimeToUtc } from '@/modules/plans/domain/recurrence-engine';
import type { RoutineBlock, RoutineSlotRole } from './routine.schema';

export type { RoutineBlock, RoutineSlotRole } from './routine.schema';

export const TIMEZONE = 'America/Sao_Paulo';

/** Rotina padrão de segunda a sexta. Buffer e Japonês incluídos como blocos. */
export const WEEKDAY_ROUTINE_BLOCKS: RoutineBlock[] = [
  { id: 'primary-1', role: 'deep_work_primary', label: 'Projeto principal', startTime: '09:00', endTime: '10:30' },
  { id: 'break-1', role: 'break', label: 'Pausa', startTime: '10:30', endTime: '10:45' },
  { id: 'primary-2', role: 'deep_work_primary', label: 'Projeto principal', startTime: '10:45', endTime: '12:30' },
  { id: 'lunch', role: 'lunch', label: 'Almoço', startTime: '12:30', endTime: '13:00' },
  { id: 'primary-3', role: 'deep_work_primary', label: 'Projeto principal', startTime: '13:00', endTime: '14:30' },
  { id: 'secondary-1', role: 'deep_work_secondary', label: 'Frente secundária', startTime: '14:30', endTime: '15:30' },
  { id: 'break-2', role: 'break', label: 'Pausa', startTime: '15:30', endTime: '16:00' },
  { id: 'secondary-2', role: 'deep_work_secondary', label: 'Frente secundária', startTime: '16:00', endTime: '17:00' },
  { id: 'buffer', role: 'buffer', label: 'Buffer', startTime: '17:00', endTime: '18:00' },
  { id: 'learning', role: 'learning', label: 'Japonês', startTime: '18:00', endTime: '23:59' },
];

const WEEKDAY_SHORT_PT: Record<number, string> = {
  0: 'domingo',
  1: 'segunda',
  2: 'terça',
  3: 'quarta',
  4: 'quinta',
  5: 'sexta',
  6: 'sábado',
};

/** Dia da semana (0=domingo…6=sábado) de uma data local YYYY-MM-DD. */
function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00`).getDay();
}

export function isBusinessDay(dateStr: string): boolean {
  const day = weekdayOf(dateStr);
  return day >= 1 && day <= 5;
}

/** Blocos do dia — vazio em sábado/domingo (nunca gera rotina de trabalho). */
export function getBlocksForDate(dateStr: string): RoutineBlock[] {
  return isBusinessDay(dateStr) ? WEEKDAY_ROUTINE_BLOCKS : [];
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Decompõe um instante UTC em (data local, hora local HH:mm) num timezone. */
export function localTimeParts(instant: Date, timeZone: string = TIMEZONE): { dateStr: string; time: string } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value;
  // hour12:false pode devolver "24" à meia-noite em alguns runtimes ICU.
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return { dateStr: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour}:${parts.minute}` };
}

/** Bloco que contém o horário local informado, ou null se fora da rotina. */
export function getCurrentBlock(blocks: RoutineBlock[], nowTime: string): RoutineBlock | null {
  const minutes = toMinutes(nowTime);
  return blocks.find((b) => minutes >= toMinutes(b.startTime) && minutes < toMinutes(b.endTime)) ?? null;
}

/** Bloco cronologicamente seguinte ao informado, no mesmo dia. */
export function getNextBlock(blocks: RoutineBlock[], current: RoutineBlock | null): RoutineBlock | null {
  if (!current) return blocks[0] ?? null;
  const idx = blocks.findIndex((b) => b.id === current.id);
  if (idx === -1) return null;
  return blocks[idx + 1] ?? null;
}

export function minutesRemainingInBlock(block: RoutineBlock, nowTime: string): number {
  return Math.max(0, toMinutes(block.endTime) - toMinutes(nowTime));
}

export function blockDurationMinutes(block: RoutineBlock): number {
  return toMinutes(block.endTime) - toMinutes(block.startTime);
}

/** Próximo bloco de mesmo papel, hoje. null se não houver mais nenhum hoje. */
export function findNextCompatibleBlockToday(
  blocks: RoutineBlock[],
  current: RoutineBlock
): RoutineBlock | null {
  const idx = blocks.findIndex((b) => b.id === current.id);
  if (idx === -1) return null;
  for (let i = idx + 1; i < blocks.length; i++) {
    if (blocks[i].role === current.role) return blocks[i];
  }
  return null;
}

/** Próximo dia útil (segunda a sexta) após a data informada. Nunca sábado/domingo. */
export function nextBusinessDayStr(dateStr: string): string {
  let next = addDaysToDateStr(dateStr, 1);
  while (!isBusinessDay(next)) {
    next = addDaysToDateStr(next, 1);
  }
  return next;
}

/** Instante ISO (UTC) do início de um bloco, numa data local. Para agendar (`scheduleItem`). */
export function blockStartIso(dateStr: string, block: RoutineBlock, timeZone: string = TIMEZONE): string {
  return zonedDateTimeToUtc(dateStr, block.startTime, timeZone).toISOString();
}

/** Combina uma data local com um horário local (HH:mm) num instante ISO (UTC). */
export function localDateTimeToIso(dateStr: string, time: string, timeZone: string = TIMEZONE): string {
  return zonedDateTimeToUtc(dateStr, time, timeZone).toISOString();
}

/** Capacidade total (minutos) de um papel num dia — soma de todos os blocos daquele papel. */
export function roleCapacityMinutesForDate(dateStr: string, role: RoutineSlotRole): number {
  return getBlocksForDate(dateStr)
    .filter((b) => b.role === role)
    .reduce((sum, b) => sum + blockDurationMinutes(b), 0);
}

/**
 * Tarefas já explicitamente agendadas numa data futura, para um projeto —
 * base do cálculo de acúmulo/sobrecarga ao adiar ("Segunda já tem 3
 * tarefas..."). Deliberadamente NÃO inclui backlog sem horário: esse ainda
 * não está comprometido com um dia específico.
 */
export function tasksScheduledOnDate<T extends RoutineTaskLike>(
  tasks: T[],
  dateStr: string,
  projectId?: string
): T[] {
  if (!projectId) return [];
  return tasks.filter(
    (t) =>
      isActiveTask(t) &&
      t.projectId === projectId &&
      t.scheduledAt &&
      localTimeParts(new Date(t.scheduledAt)).dateStr === dateStr
  );
}

/** Rótulo curto da origem de uma pendência ("ontem", "sexta", ou dd/mm se mais antigo). */
export function originDayLabel(originDateStr: string, todayStr: string): string {
  const yesterday = addDaysToDateStr(todayStr, -1);
  if (originDateStr === yesterday) return 'ontem';
  const diffDays = Math.round(
    (new Date(`${todayStr}T00:00:00`).getTime() - new Date(`${originDateStr}T00:00:00`).getTime()) / 86400000
  );
  if (diffDays >= 1 && diffDays <= 6) {
    return WEEKDAY_SHORT_PT[weekdayOf(originDateStr)];
  }
  const [, m, d] = originDateStr.split('-');
  return `${d}/${m}`;
}

export interface RoutineTaskLike {
  id: string;
  type: string;
  status: string;
  priority: string;
  projectId?: string;
  scheduledAt?: string;
  dueAt?: string;
  estimatedMinutes?: number;
  completedAt?: string;
}

function isActiveTask<T extends RoutineTaskLike>(t: T): boolean {
  return t.type === 'task' && t.status !== 'completed' && t.status !== 'archived';
}

/** Concluída HOJE (dia local) — ainda deve ficar visível, riscada, na lista do bloco. */
function isCompletedToday<T extends RoutineTaskLike>(t: T, todayStr: string): boolean {
  if (t.status !== 'completed' || !t.completedAt) return false;
  return localTimeParts(new Date(t.completedAt)).dateStr === todayStr;
}

function fallsInBlockToday<T extends RoutineTaskLike>(t: T, block: RoutineBlock, todayStr: string): boolean {
  if (!t.scheduledAt) return false;
  const { dateStr, time } = localTimeParts(new Date(t.scheduledAt));
  if (dateStr !== todayStr) return false;
  const minutes = toMinutes(time);
  return minutes >= toMinutes(block.startTime) && minutes < toMinutes(block.endTime);
}

const PRIORITY_ORDER: Record<string, number> = { critical: 4, high: 3, normal: 2, low: 1 };

function compareTasks<T extends RoutineTaskLike>(a: T, b: T): number {
  const aDone = a.status === 'completed';
  const bDone = b.status === 'completed';
  if (aDone !== bDone) return aDone ? 1 : -1;
  const aScheduled = Boolean(a.scheduledAt);
  const bScheduled = Boolean(b.scheduledAt);
  if (aScheduled !== bScheduled) return aScheduled ? -1 : 1;
  if (aScheduled && bScheduled && a.scheduledAt !== b.scheduledAt) {
    return a.scheduledAt! < b.scheduledAt! ? -1 : 1;
  }
  return (PRIORITY_ORDER[b.priority] ?? 0) - (PRIORITY_ORDER[a.priority] ?? 0);
}

/**
 * Tarefas associadas a um bloco hoje.
 * - Projeto principal/Frente secundária: tarefas ativas do projeto atribuído
 *   ao papel, sem horário (backlog que "flui" para o bloco atual) OU
 *   explicitamente agendadas dentro da janela do bloco.
 * - Buffer: só tarefas explicitamente agendadas nele (nunca preenchido
 *   automaticamente).
 * - Pausa/Almoço/Japonês: nunca mostram tarefas genéricas.
 * Tarefas concluídas HOJE continuam na lista (riscadas) — não desaparecem
 * instantaneamente; só saem no dia seguinte.
 */
export function selectTasksForBlock<T extends RoutineTaskLike>(
  block: RoutineBlock,
  tasks: T[],
  todayStr: string,
  roleProjectId?: string
): T[] {
  const relevant = tasks.filter((t) => isActiveTask(t) || isCompletedToday(t, todayStr));

  if (block.role === 'deep_work_primary' || block.role === 'deep_work_secondary') {
    if (!roleProjectId) return [];
    return relevant
      .filter((t) => t.projectId === roleProjectId && (!t.scheduledAt || fallsInBlockToday(t, block, todayStr)))
      .sort(compareTasks);
  }

  if (block.role === 'buffer') {
    return relevant.filter((t) => fallsInBlockToday(t, block, todayStr)).sort(compareTasks);
  }

  return [];
}

export interface LoadSummary {
  plannedMinutes: number;
  capacityMinutes: number;
  overCapacity: boolean;
  overMinutes: number;
}

export function computeLoad<T extends { estimatedMinutes?: number }>(
  tasks: T[],
  capacityMinutes: number
): LoadSummary {
  const plannedMinutes = tasks.reduce((sum, t) => sum + (t.estimatedMinutes ?? 30), 0);
  return {
    plannedMinutes,
    capacityMinutes,
    overCapacity: plannedMinutes > capacityMinutes,
    overMinutes: Math.max(0, plannedMinutes - capacityMinutes),
  };
}

export interface PendingGroup<T> {
  originDateStr: string;
  label: string;
  tasks: T[];
  totalMinutes: number;
}

/**
 * Pendências de execução anterior: tarefas ativas cuja data de referência
 * (agendamento ou prazo) já passou. Agrupadas por dia de origem, para o
 * usuário ver "adiado de sexta" separado de "adiado de ontem" — nunca uma
 * lista genérica de todos os itens abertos do sistema.
 */
export function classifyPendingItems<T extends RoutineTaskLike>(
  tasks: T[],
  todayStr: string
): PendingGroup<T>[] {
  const active = tasks.filter(isActiveTask);
  const groups = new Map<string, T[]>();

  for (const t of active) {
    const dateRef = t.scheduledAt ?? t.dueAt;
    if (!dateRef) continue;
    const dateStr = localTimeParts(new Date(dateRef)).dateStr;
    if (dateStr >= todayStr) continue;
    groups.set(dateStr, [...(groups.get(dateStr) ?? []), t]);
  }

  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([originDateStr, groupTasks]) => ({
      originDateStr,
      label: originDayLabel(originDateStr, todayStr),
      tasks: groupTasks,
      totalMinutes: groupTasks.reduce((sum, t) => sum + (t.estimatedMinutes ?? 30), 0),
    }));
}

import { z } from 'zod';

/**
 * Rotina diária: estrutura de tempo fixa (blocos), separada das tarefas que
 * os ocupam. Um bloco nunca é uma task/item — é apenas um intervalo de tempo
 * com um "papel" (role). Qual projeto ocupa um papel é configurável (ver
 * workspace_settings.routine_primary_project_id/routine_secondary_project_id),
 * nunca hardcoded aqui.
 */
export const RoutineSlotRoleSchema = z.enum([
  'deep_work_primary',
  'deep_work_secondary',
  'break',
  'lunch',
  'buffer',
  'learning',
]);
export type RoutineSlotRole = z.infer<typeof RoutineSlotRoleSchema>;

export interface RoutineBlock {
  /** Estável entre dias — usado para localizar o próximo bloco na mesma lista. */
  id: string;
  role: RoutineSlotRole;
  label: string;
  /** HH:mm, hora local America/Sao_Paulo. */
  startTime: string;
  /** HH:mm, hora local America/Sao_Paulo (exclusivo). */
  endTime: string;
}

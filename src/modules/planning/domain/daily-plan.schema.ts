import { z } from 'zod';
import { isoDateTimeSchema } from '@/lib/zod-datetime';

/**
 * @deprecated "Foco do Dia" foi removido da Home (Fase 1 — blocos de
 * rotina). Nenhuma tela nova depende deste módulo. Mantido sem migration
 * destrutiva — dados existentes continuam legíveis/migráveis — até uma
 * migration de limpeza dedicada remover `daily_plans`/`daily_plan_items`.
 * Ver docs/ARCHITECTURE.md e docs/ROADMAP.md.
 */
export const DailyPlanSchema = z.object({
  workspaceId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD"),
  focusItemIds: z.array(z.string().uuid()).max(3, "No máximo 3 itens permitidos no foco diário"),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type DailyPlan = z.infer<typeof DailyPlanSchema>;

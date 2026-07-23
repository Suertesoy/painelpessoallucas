import { z } from 'zod';
import { isoDateTimeSchema } from '@/lib/zod-datetime';

export const DailyPlanSchema = z.object({
  workspaceId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD"),
  focusItemIds: z.array(z.string().uuid()).max(3, "No máximo 3 itens permitidos no foco diário"),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type DailyPlan = z.infer<typeof DailyPlanSchema>;

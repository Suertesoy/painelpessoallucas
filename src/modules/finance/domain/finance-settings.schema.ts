import { z } from 'zod';
import { isoDateTimeSchema } from '@/lib/zod-datetime';

export const FinanceSettingsSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string(),
  defaultMatheusIncomeCents: z.number().int().min(0),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type FinanceSettings = z.infer<typeof FinanceSettingsSchema>;

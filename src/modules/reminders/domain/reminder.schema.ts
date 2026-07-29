import { z } from 'zod';
import { isoDateTimeSchema } from '@/lib/zod-datetime';

export const ReminderStatusSchema = z.enum(['pending', 'sent', 'dismissed', 'cancelled']);
export const ReminderChannelSchema = z.enum(['app', 'email', 'push']);

export const ReminderSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string(),
  itemId: z.string().uuid().optional(),
  planActionId: z.string().uuid().optional(),
  message: z.string().min(1),
  remindAt: isoDateTimeSchema,
  channel: ReminderChannelSchema,
  status: ReminderStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type Reminder = z.infer<typeof ReminderSchema>;
export type ReminderStatus = z.infer<typeof ReminderStatusSchema>;
export type ReminderChannel = z.infer<typeof ReminderChannelSchema>;

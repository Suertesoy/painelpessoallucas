import { z } from 'zod';
import { isoDateTimeSchema } from '@/lib/zod-datetime';

export const DomainEventSchema = z.object({
  id: z.string().uuid(),
  type: z.string(), 
  entityId: z.string(), 
  workspaceId: z.string(),
  source: z.string(),
  payload: z.any(), 
  createdAt: isoDateTimeSchema,
  processedAt: isoDateTimeSchema.optional(),
});

export type DomainEvent = z.infer<typeof DomainEventSchema>;

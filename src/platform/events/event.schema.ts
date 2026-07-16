import { z } from 'zod';

export const DomainEventSchema = z.object({
  id: z.string().uuid(),
  type: z.string(), 
  entityId: z.string(), 
  workspaceId: z.string(),
  source: z.string(),
  payload: z.any(), 
  createdAt: z.string().datetime(),
  processedAt: z.string().datetime().optional(),
});

export type DomainEvent = z.infer<typeof DomainEventSchema>;

import { z } from 'zod';

export const ItemTypeSchema = z.enum(['task', 'idea', 'insight', 'decision', 'reminder', 'reference', 'note']);
export const ItemStatusSchema = z.enum(['inbox', 'organized', 'planned', 'in_progress', 'blocked', 'completed', 'archived']);
export const ItemPrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);
export const ItemSourceSchema = z.enum(['quick_capture', 'manual', 'import', 'ai', 'integration', 'mcp', 'automation']);

export const ItemSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
  type: ItemTypeSchema,
  status: ItemStatusSchema,
  priority: ItemPrioritySchema,
  projectId: z.string().uuid().optional(),
  dueAt: z.string().datetime().optional(),
  scheduledAt: z.string().datetime().optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  nextAction: z.string().optional(),
  source: ItemSourceSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  archivedAt: z.string().datetime().optional(),
});

export type Item = z.infer<typeof ItemSchema>;
export type ItemType = z.infer<typeof ItemTypeSchema>;
export type ItemStatus = z.infer<typeof ItemStatusSchema>;
export type ItemPriority = z.infer<typeof ItemPrioritySchema>;
export type ItemSource = z.infer<typeof ItemSourceSchema>;

export const CreateItemSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  type: ItemTypeSchema.optional().default('note'),
  priority: ItemPrioritySchema.optional().default('normal'),
  projectId: z.string().uuid().optional(),
  dueAt: z.string().datetime().optional(),
  scheduledAt: z.string().datetime().optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  nextAction: z.string().optional(),
  source: ItemSourceSchema.optional().default('manual'),
}).refine(data => data.title || data.content, {
  message: "O item deve ter um título ou conteúdo",
  path: ["title"]
});

export type CreateItemDTO = z.input<typeof CreateItemSchema>;

export const UpdateItemSchema = ItemSchema.partial().omit({ id: true, workspaceId: true, createdAt: true, source: true });
export type UpdateItemDTO = z.infer<typeof UpdateItemSchema>;

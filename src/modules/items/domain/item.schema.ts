import { z } from 'zod';
import { isoDateTimeSchema } from '@/lib/zod-datetime';

export const ItemTypeSchema = z.enum(['task', 'idea', 'insight', 'decision', 'reminder', 'reference', 'note']);
export const ItemStatusSchema = z.enum(['inbox', 'organized', 'planned', 'in_progress', 'blocked', 'completed', 'archived']);
export const ItemPrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);
export const ItemSourceSchema = z.enum(['quick_capture', 'manual', 'import', 'ai', 'integration', 'mcp', 'automation', 'audio_capture']);

export const ItemSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
  type: ItemTypeSchema,
  status: ItemStatusSchema,
  priority: ItemPrioritySchema,
  projectId: z.string().uuid().optional(),
  dueAt: isoDateTimeSchema.optional(),
  scheduledAt: isoDateTimeSchema.optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  nextAction: z.string().optional(),
  source: ItemSourceSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.optional(),
  archivedAt: isoDateTimeSchema.optional(),
  // Proveniência (Fase 2): ocorrências materializadas por planos/recorrências.
  executionPlanId: z.string().uuid().optional(),
  planPhaseId: z.string().uuid().optional(),
  planActionId: z.string().uuid().optional(),
  recurrenceRuleId: z.string().uuid().optional(),
  occurrenceAt: isoDateTimeSchema.optional(),
  // Proveniência (Fase 3): duração da gravação, só presente em source=audio_capture.
  audioDurationSeconds: z.number().int().positive().optional(),
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
  dueAt: isoDateTimeSchema.optional(),
  scheduledAt: isoDateTimeSchema.optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  nextAction: z.string().optional(),
  source: ItemSourceSchema.optional().default('manual'),
  audioDurationSeconds: z.number().int().positive().optional(),
}).refine(data => data.title || data.content, {
  message: "O item deve ter um título ou conteúdo",
  path: ["title"]
});

export type CreateItemDTO = z.input<typeof CreateItemSchema>;

export const UpdateItemSchema = ItemSchema.partial().omit({ id: true, workspaceId: true, createdAt: true, source: true });
export type UpdateItemDTO = z.infer<typeof UpdateItemSchema>;

import { z } from 'zod';
import { isoDateTimeSchema } from '@/lib/zod-datetime';

export const ProjectStatusSchema = z.enum(['active', 'paused', 'completed', 'archived']);
export const ProjectAttentionLevelSchema = z.enum(['normal', 'attention', 'critical']);

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string(),
  name: z.string().min(1, "O nome do projeto é obrigatório"),
  description: z.string().optional(),
  objective: z.string().optional(),
  status: ProjectStatusSchema,
  attentionLevel: ProjectAttentionLevelSchema,
  nextMilestone: z.string().optional(),
  dueAt: isoDateTimeSchema.optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  archivedAt: isoDateTimeSchema.optional(),
});

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type ProjectAttentionLevel = z.infer<typeof ProjectAttentionLevelSchema>;

export const CreateProjectSchema = z.object({
  name: z.string().min(1, "O nome do projeto é obrigatório"),
  description: z.string().optional(),
  objective: z.string().optional(),
  status: ProjectStatusSchema.optional().default('active'),
  attentionLevel: ProjectAttentionLevelSchema.optional().default('normal'),
  nextMilestone: z.string().optional(),
  dueAt: isoDateTimeSchema.optional(),
});
export type CreateProjectDTO = z.input<typeof CreateProjectSchema>;

export const UpdateProjectSchema = ProjectSchema.partial().omit({ id: true, workspaceId: true, createdAt: true });
export type UpdateProjectDTO = z.infer<typeof UpdateProjectSchema>;

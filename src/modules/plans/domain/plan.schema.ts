import { z } from 'zod';

/**
 * Domínio de documentos e planos de execução (Fase 2 — Etapas 3-5).
 *
 * Princípio central: o plano aprovado é a DEFINIÇÃO. As tarefas (items) são
 * ocorrências materiais geradas conforme a execução — nunca criadas em massa
 * automaticamente na aprovação.
 */

// --- Source documents --------------------------------------------------------

export const DocumentTypeSchema = z.enum([
  'personal_guide',
  'project_plan',
  'meeting_notes',
  'strategy',
  'reference',
  'other',
]);

export const DocumentSourceSchema = z.enum(['paste', 'file_md', 'file_txt']);

export const ProcessingStatusSchema = z.enum([
  'pending',
  'queued',
  'processing',
  'completed',
  'failed',
]);

export const SourceDocumentSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  title: z.string().min(1, 'O documento precisa de um título'),
  documentType: DocumentTypeSchema,
  originalContent: z.string().min(1, 'O documento não pode estar vazio'),
  contentHash: z.string(),
  source: DocumentSourceSchema,
  processingStatus: ProcessingStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SourceDocument = z.infer<typeof SourceDocumentSchema>;
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

export const CreateSourceDocumentSchema = z.object({
  title: z.string().min(1, 'Informe um título para o documento'),
  documentType: DocumentTypeSchema.default('other'),
  originalContent: z
    .string()
    .min(1, 'Cole ou importe o conteúdo do documento')
    .max(120_000, 'Documento muito grande (limite ~120 mil caracteres)'),
  source: DocumentSourceSchema.default('paste'),
  projectId: z.string().uuid().optional(),
});
export type CreateSourceDocumentDTO = z.input<typeof CreateSourceDocumentSchema>;

// --- Execution plans ---------------------------------------------------------

export const PlanStatusSchema = z.enum([
  'draft',
  'awaiting_review',
  'approved',
  'active',
  'paused',
  'completed',
  'archived',
]);

export const ExecutionPlanSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  sourceDocumentId: z.string().uuid().optional(),
  name: z.string().min(1),
  objective: z.string().optional(),
  status: PlanStatusSchema,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timezone: z.string().default('America/Sao_Paulo'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  approvedAt: z.string().datetime().optional(),
});

export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

// --- Phases ------------------------------------------------------------------

export const PlanPhaseSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  executionPlanId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  position: z.number().int().min(0),
  startOffsetDays: z.number().int().optional(),
  durationDays: z.number().int().positive().optional(),
  milestone: z.string().optional(),
  successCriteria: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type PlanPhase = z.infer<typeof PlanPhaseSchema>;

// --- Recurrence rules --------------------------------------------------------

export const RecurrenceFrequencySchema = z.enum([
  'daily',
  'weekly',
  'monthly',
  'once',
  'relative_to_plan_start',
  'relative_to_phase_start',
  'relative_to_event',
]);

export const RecurrenceRuleSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  executionPlanId: z.string().uuid().optional(),
  frequency: RecurrenceFrequencySchema,
  interval: z.number().int().min(1).default(1),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  localTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  timezone: z.string().default('America/Sao_Paulo'),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  maxOccurrences: z.number().int().positive().optional(),
  nextOccurrenceAt: z.string().datetime().optional(),
  lastOccurrenceAt: z.string().datetime().optional(),
  isActive: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type RecurrenceRule = z.infer<typeof RecurrenceRuleSchema>;
export type RecurrenceFrequency = z.infer<typeof RecurrenceFrequencySchema>;

// --- Actions -----------------------------------------------------------------

export const ActionTypeSchema = z.enum([
  'task',
  'routine',
  'reminder',
  'milestone',
  'decision',
  'waiting',
]);

export const DueRuleSchema = z
  .union([
    z.object({ type: z.literal('fixed'), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
    z.object({ type: z.literal('offset_from_start'), days: z.number().int().min(0) }),
    z.object({ type: z.literal('offset_from_phase'), days: z.number().int().min(0) }),
  ])
  .optional();

export const ScheduleRuleSchema = z
  .object({
    time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    durationMinutes: z.number().int().positive().optional(),
  })
  .optional();

export const PlanActionSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  executionPlanId: z.string().uuid(),
  phaseId: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  actionType: ActionTypeSchema,
  priority: z.enum(['low', 'normal', 'high', 'critical']),
  estimatedMinutes: z.number().int().positive().optional(),
  dueRule: DueRuleSchema,
  scheduleRule: ScheduleRuleSchema,
  recurrenceRuleId: z.string().uuid().optional(),
  dependencyActionIds: z.array(z.string().uuid()).default([]),
  waitingOn: z.string().optional(),
  requiresConfirmation: z.boolean().default(false),
  position: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type PlanAction = z.infer<typeof PlanActionSchema>;
export type ActionType = z.infer<typeof ActionTypeSchema>;

// --- Notifications -----------------------------------------------------------

export const NotificationSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  type: z.string(),
  title: z.string(),
  body: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  readAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Notification = z.infer<typeof NotificationSchema>;

// --- Agregado para telas de detalhe/revisão ----------------------------------

export interface PlanDetail {
  plan: ExecutionPlan;
  phases: PlanPhase[];
  actions: PlanAction[];
  recurrenceRules: RecurrenceRule[];
}

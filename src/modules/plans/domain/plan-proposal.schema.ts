import { z } from 'zod';

/**
 * Proposta estruturada gerada pela IA a partir de um documento.
 *
 * IMPORTANTE: isto é uma PROPOSTA. A IA nunca cria, conclui, arquiva ou
 * reagenda dados. Os commands da aplicação executam somente o que o usuário
 * aprovar na tela de revisão.
 *
 * Nota técnica: os campos usam .nullable() (e não .optional()) porque o modo
 * estrito de structured outputs da OpenAI exige todas as chaves presentes.
 */

const PrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);

export const ProposedRecurrenceSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'once']),
  interval: z.number().int().min(1),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).nullable(),
  dayOfMonth: z.number().int().min(1).max(31).nullable(),
  localTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
});

export const ProposedActionSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable(),
  phaseIndex: z.number().int().min(0).nullable(),
  actionType: z.enum(['task', 'routine', 'reminder', 'milestone', 'decision', 'waiting']),
  priority: PrioritySchema,
  estimatedMinutes: z.number().int().positive().nullable(),
  suggestedStart: z.string().nullable(), // YYYY-MM-DD
  suggestedDue: z.string().nullable(),   // YYYY-MM-DD
  recurrence: ProposedRecurrenceSchema.nullable(),
  dependencies: z.array(z.number().int().min(0)),
  waitingOn: z.string().nullable(),
  reasoningSummary: z.string().nullable(),
  needsConfirmation: z.boolean(),
});

export const ProposedPhaseSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  startOffsetDays: z.number().int().min(0).nullable(),
  durationDays: z.number().int().positive().nullable(),
  milestone: z.string().nullable(),
  successCriteria: z.string().nullable(),
});

export const ProposedRoutineSchema = z.object({
  title: z.string().min(1),
  localTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).nullable(),
  estimatedMinutes: z.number().int().positive().nullable(),
});

export const ProposedReminderSchema = z.object({
  message: z.string().min(1),
  date: z.string().nullable(), // YYYY-MM-DD
  localTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
});

export const PlanProposalSchema = z.object({
  projectSuggestion: z.string().nullable(),
  planName: z.string().min(1),
  objective: z.string().nullable(),
  assumptions: z.array(z.string()),
  confirmedFacts: z.array(z.string()),
  openQuestions: z.array(z.string()),
  decisions: z.array(z.string()),
  phases: z.array(ProposedPhaseSchema),
  actions: z.array(ProposedActionSchema),
  milestones: z.array(z.string()),
  risks: z.array(z.string()),
  dependencies: z.array(z.string()),
  waitingItems: z.array(z.string()),
  dailyRoutines: z.array(ProposedRoutineSchema),
  weeklyRoutines: z.array(ProposedRoutineSchema),
  suggestedReminders: z.array(ProposedReminderSchema),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
});

export type PlanProposal = z.infer<typeof PlanProposalSchema>;
export type ProposedAction = z.infer<typeof ProposedActionSchema>;
export type ProposedPhase = z.infer<typeof ProposedPhaseSchema>;

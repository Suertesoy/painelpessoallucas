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

/**
 * Data relativa ao início do plano/fase, ou fixa — espelha
 * `PlanDateRuleSchema` do domínio (modules/plans/domain/plan.schema.ts),
 * mas mantida separada de propósito: este é o contrato validado na
 * FRONTEIRA da IA (nunca importa o schema de domínio), enquanto aquele é a
 * verdade interna após a resolução determinística na ativação.
 *
 * A IA nunca deve calcular uma data absoluta a partir de referências
 * relativas do documento (ex.: "Semana 3", "sexta-feira da segunda semana").
 * Para essas, use offset_from_phase (dias a partir do início da fase
 * indicada por phaseIndex) ou offset_from_start (dias a partir do início do
 * plano). type fixed só quando o documento cita uma data de calendário
 * explícita (ex.: "reunião em 15/09").
 */
export const ProposedDateRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fixed'), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ type: z.literal('offset_from_start'), days: z.number().int().min(0) }),
  z.object({ type: z.literal('offset_from_phase'), days: z.number().int().min(0) }),
]);

export const ProposedRecurrenceSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'once']),
  interval: z.number().int().min(1),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).nullable(),
  dayOfMonth: z.number().int().min(1).max(31).nullable(),
  localTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
});

/**
 * Projeto da ação, na fronteira da IA — espelha `PlanActionProjectAssignmentSchema`
 * do domínio (mantido separado de propósito, mesmo padrão de
 * ProposedDateRuleSchema/PlanDateRuleSchema).
 *
 * - inherit  → a ação pertence ao projeto principal do plano (padrão).
 * - specific → a ação pertence a OUTRO projeto; projectName deve ser o nome
 *   EXATO de um projeto já existente (fornecido no contexto). A IA nunca cria
 *   projeto: se o nome não corresponder a nenhum projeto existente, o
 *   servidor marca a sugestão para confirmação humana em vez de criar.
 * - none     → a ação não pertence a nenhum projeto (ex.: hábito pessoal).
 */
export const ProposedProjectAssignmentSchema = z.enum(['inherit', 'specific', 'none']);

export const ProposedActionSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable(),
  phaseIndex: z.number().int().min(0).nullable(),
  actionType: z.enum(['task', 'routine', 'reminder', 'milestone', 'decision', 'waiting']),
  priority: PrioritySchema,
  estimatedMinutes: z.number().int().positive().nullable(),
  projectAssignment: ProposedProjectAssignmentSchema,
  /** Nome exato de um projeto existente — só relevante quando projectAssignment é "specific". */
  projectName: z.string().nullable(),
  /** Prazo (deadline) real da ação — nunca o dia planejado de execução. */
  suggestedDue: ProposedDateRuleSchema.nullable(),
  /**
   * Agendamento: dia + horário planejados para executar a ação (ex.: grade
   * semanal de horários do documento). Distinto de suggestedDue — uma ação
   * pode ter só agendamento, só prazo, os dois, ou nenhum.
   */
  suggestedSchedule: z
    .object({
      dateRule: ProposedDateRuleSchema.nullable(),
      localTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
    })
    .nullable(),
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
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
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

import { z } from 'zod';
import { ItemTypeSchema, ItemPrioritySchema } from '@/modules/items/domain/item.schema';

/**
 * Proposta estruturada gerada pela IA a partir da transcrição de uma
 * captura por áudio.
 *
 * IMPORTANTE: isto é uma PROPOSTA. A IA nunca cria, edita, conclui, arquiva,
 * agenda ou envia nada — só sugere. Os Commands da aplicação (e uma rota de
 * confirmação, no caso do Calendar) executam somente o que o usuário aprovar
 * na tela de revisão.
 *
 * Campos usam .nullable() (não .optional()) porque o modo estrito de
 * structured outputs da OpenAI exige todas as chaves presentes — mesmo
 * padrão de plan-proposal.schema.ts.
 */

export const TriageIntentSchema = z.enum([
  'task',
  'idea',
  'insight',
  'decision',
  'reminder',
  'calendar_event',
  'meeting',
  'note',
  'multiple',
  'unknown',
]);

export const ProjectCandidateSchema = z.object({
  projectId: z.string().uuid(),
  projectName: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

/**
 * itemType usa o enum REAL do domínio (ItemTypeSchema) — não existe tipo de
 * item "reunião"/"evento": uma reunião vira um calendarProposal; se também
 * gerar uma tarefa de preparo, essa tarefa é um proposedAction separado com
 * itemType 'task'.
 */
export const ProposedActionSchema = z.object({
  actionType: z.enum(['create_item', 'update_capture', 'create_calendar_event']),
  title: z.string().min(1),
  description: z.string().nullable(),
  itemType: ItemTypeSchema.nullable(),
  priority: ItemPrioritySchema.nullable(),
  projectId: z.string().uuid().nullable(),
  nextAction: z.string().nullable(),
  dueAt: z.string().nullable(), // ISO 8601; null quando a data não está clara
  scheduledAt: z.string().nullable(),
  estimatedMinutes: z.number().int().positive().nullable(),
  confidence: z.number().min(0).max(1),
});

export const CalendarProposalSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable(),
  startAt: z.string().nullable(), // ISO 8601; null quando o horário não está claro
  endAt: z.string().nullable(),
  timezone: z.string(),
  location: z.string().nullable(),
  attendees: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export const AudioTriageProposalSchema = z.object({
  intent: TriageIntentSchema,
  suggestedTitle: z.string().min(1),
  summary: z.string(),
  projectCandidates: z.array(ProjectCandidateSchema),
  proposedActions: z.array(ProposedActionSchema),
  calendarProposal: CalendarProposalSchema.nullable(),
  missingInformation: z.array(z.string()),
  overallConfidence: z.number().min(0).max(1),
});

export type TriageIntent = z.infer<typeof TriageIntentSchema>;
export type ProjectCandidate = z.infer<typeof ProjectCandidateSchema>;
export type ProposedAction = z.infer<typeof ProposedActionSchema>;
export type CalendarProposal = z.infer<typeof CalendarProposalSchema>;
export type AudioTriageProposal = z.infer<typeof AudioTriageProposalSchema>;

/** Confiança mínima para pré-marcar uma sugestão de projeto como selecionada. */
export const AUTO_SELECT_CONFIDENCE_THRESHOLD = 0.7;

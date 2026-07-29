import { z } from 'zod';
import { isoDateTimeSchema } from '@/lib/zod-datetime';
import { ExerciseOutcomeSchema } from './lesson-content.schema';

/**
 * Progresso persistido de uma lição (Fase 2 do módulo — fechamento). Uma
 * linha por (workspace, lição): a ausência de linha É o estado
 * `not_started` — só passa a existir na primeira visualização da lição
 * (`recordLessonViewed`, que nunca conclui — ver `completeLesson` abaixo).
 *
 * `attempts` é a fonte de verdade por `blockId`: aprendizagem, não avaliação
 * — uma resposta incorreta trava a **avaliação** (`firstOutcome` é
 * imutável), mas nunca trava a **tentativa** (o exercício continua
 * respondível até ser resolvido). `answeredCount`/`resolvedCount` são
 * contadores derivados e persistidos, sempre recalculados a partir de
 * `attempts` pelas Commands — mesmo princípio de `LearningModule.lessonsCount`.
 */
export const LessonProgressStatusSchema = z.enum(['not_started', 'in_progress', 'completed']);
export type LessonProgressStatus = z.infer<typeof LessonProgressStatusSchema>;

/**
 * Estado acumulado de um bloco de exercício dentro de uma lição.
 * - `firstOutcome`: resultado da primeira tentativa — imutável, preservado
 *   para análise futura (ex.: uma fase de SRS decidiria a partir dele se um
 *   item precisa de mais repetição). Nunca sobrescrito.
 * - `latestOutcome`: resultado da tentativa mais recente — é o que a UI usa
 *   para decidir se o exercício ainda está aberto para nova tentativa.
 * - `attemptCount`: quantas vezes o exercício foi respondido de fato.
 * - `resolvedAt`: preenchido na primeira vez em que `outcome === 'correct'`.
 *   A partir daí o exercício trava (não abre para nova tentativa) — é o que
 *   define "exercício resolvido", distinto de "lição concluída".
 */
export const ExerciseAttemptSchema = z.object({
  firstOutcome: ExerciseOutcomeSchema,
  latestOutcome: ExerciseOutcomeSchema,
  attemptCount: z.number().int().min(1),
  resolvedAt: isoDateTimeSchema.optional(),
});
export type ExerciseAttempt = z.infer<typeof ExerciseAttemptSchema>;

export const LessonProgressSchema = z
  .object({
    id: z.string().uuid(),
    workspaceId: z.string().uuid(),
    courseId: z.string().uuid(),
    moduleId: z.string().uuid(),
    lessonId: z.string().uuid(),
    totalExercises: z.number().int().min(0),
    /** Exercícios com ao menos uma tentativa — não infla com retentativas. */
    answeredCount: z.number().int().min(0),
    /** Exercícios já resolvidos (acertados em alguma tentativa). */
    resolvedCount: z.number().int().min(0),
    attempts: z.record(z.string(), ExerciseAttemptSchema),
    status: LessonProgressStatusSchema,
    startedAt: isoDateTimeSchema,
    lastActivityAt: isoDateTimeSchema,
    /** Preenchido só pela ação explícita "Concluir lição" — nunca inferido
     * de visualização ou de exercícios resolvidos (ver `completeLesson`). */
    completedAt: isoDateTimeSchema.optional(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .superRefine((progress, ctx) => {
    const attemptEntries = Object.values(progress.attempts);
    if (attemptEntries.length !== progress.answeredCount) {
      ctx.addIssue({ code: 'custom', message: 'answeredCount precisa refletir o tamanho de attempts', path: ['answeredCount'] });
    }
    const resolvedInAttempts = attemptEntries.filter((a) => a.resolvedAt != null).length;
    if (resolvedInAttempts !== progress.resolvedCount) {
      ctx.addIssue({ code: 'custom', message: 'resolvedCount precisa refletir os resolvidos em attempts', path: ['resolvedCount'] });
    }
    if (progress.answeredCount > progress.totalExercises) {
      ctx.addIssue({ code: 'custom', message: 'answeredCount não pode exceder totalExercises', path: ['answeredCount'] });
    }
    if (progress.resolvedCount > progress.answeredCount) {
      ctx.addIssue({ code: 'custom', message: 'resolvedCount não pode exceder answeredCount', path: ['resolvedCount'] });
    }
    if (progress.completedAt != null && progress.status !== 'completed') {
      ctx.addIssue({ code: 'custom', message: 'completedAt só pode existir quando status é completed', path: ['completedAt'] });
    }
  });
export type LessonProgress = z.infer<typeof LessonProgressSchema>;

/**
 * Só para decidir a UI de confirmação antes de concluir manualmente — nunca
 * bloqueia `completeLesson` (a conclusão é sempre permitida; isto só decide
 * se um aviso de pendência aparece antes). Pura e testável isoladamente,
 * mesmo padrão de `isDailyGoalMet`.
 */
export function hasPendingExercises(totalExercises: number, resolvedCount: number): boolean {
  return resolvedCount < totalExercises;
}

export const RecordExerciseResultSchema = z.object({
  blockId: z.string().min(1),
  outcome: ExerciseOutcomeSchema,
});
export type RecordExerciseResultDTO = z.input<typeof RecordExerciseResultSchema>;

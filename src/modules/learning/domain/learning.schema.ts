import { z } from 'zod';
import { isoDateTimeSchema } from '@/lib/zod-datetime';

/**
 * Learning Engine — domínio genérico de aprendizado (Fase 1).
 *
 * Japonês é o primeiro curso cadastrado, não um conceito hardcoded: todo
 * schema aqui é neutro em relação ao curso. Preferências de exibição
 * (romaji/furigana/tradução) são específicas de curso justamente para não
 * contaminar o Learning Engine com conceitos que só fazem sentido para
 * idiomas com escrita não-latina.
 */

// --- Course ------------------------------------------------------------------

export const CourseStatusSchema = z.enum(['active', 'archived']);
export type CourseStatus = z.infer<typeof CourseStatusSchema>;

export const MIN_DAILY_GOAL_MINUTES = 5;
export const MAX_DAILY_GOAL_MINUTES = 180;

const dailyGoalMinutesSchema = z
  .number()
  .int('A meta diária precisa ser um número inteiro de minutos')
  .min(MIN_DAILY_GOAL_MINUTES, `A meta diária mínima é ${MIN_DAILY_GOAL_MINUTES} minutos`)
  .max(MAX_DAILY_GOAL_MINUTES, `A meta diária máxima é ${MAX_DAILY_GOAL_MINUTES} minutos`);

export const CourseSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  status: CourseStatusSchema,
  dailyGoalMinutes: dailyGoalMinutesSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Course = z.infer<typeof CourseSchema>;

// --- LearningModule ------------------------------------------------------------

export const ModuleStatusSchema = z.enum(['locked', 'available', 'in_progress', 'completed']);
export type ModuleStatus = z.infer<typeof ModuleStatusSchema>;

export const LearningModuleSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  courseId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  position: z.number().int().min(0),
  status: ModuleStatusSchema,
  lessonsCount: z.number().int().min(0),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type LearningModule = z.infer<typeof LearningModuleSchema>;

// --- StudySession --------------------------------------------------------------

export const StudySessionStatusSchema = z.enum(['planned', 'in_progress', 'completed', 'cancelled']);
export type StudySessionStatus = z.infer<typeof StudySessionStatusSchema>;

export const StudySessionSourceSchema = z.enum(['manual', 'session_flow']);
export type StudySessionSource = z.infer<typeof StudySessionSourceSchema>;

export const StudySessionSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  courseId: z.string().uuid(),
  startedAt: isoDateTimeSchema,
  endedAt: isoDateTimeSchema.optional(),
  durationMinutes: z.number().int().positive().max(600).optional(),
  status: StudySessionStatusSchema,
  source: StudySessionSourceSchema,
  dailyGoalMinutesSnapshot: dailyGoalMinutesSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type StudySession = z.infer<typeof StudySessionSchema>;

export const CompleteStudySessionSchema = z.object({
  durationMinutes: z
    .number()
    .int('A duração precisa ser um número inteiro de minutos')
    .positive('A duração precisa ser maior que zero')
    .max(600, 'A duração máxima de uma sessão é 600 minutos'),
});
export type CompleteStudySessionDTO = z.input<typeof CompleteStudySessionSchema>;

// --- LearningPreferences (gerais) ----------------------------------------------

export const LearningPreferencesSchema = z.object({
  workspaceId: z.string().uuid(),
  defaultDailyGoalMinutes: dailyGoalMinutesSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type LearningPreferences = z.infer<typeof LearningPreferencesSchema>;

export const UpdateLearningPreferencesSchema = z.object({
  defaultDailyGoalMinutes: dailyGoalMinutesSchema,
});
export type UpdateLearningPreferencesDTO = z.input<typeof UpdateLearningPreferencesSchema>;

// --- CoursePreferences (específicas do curso) ----------------------------------

export const CoursePreferencesSchema = z.object({
  workspaceId: z.string().uuid(),
  courseId: z.string().uuid(),
  showRomaji: z.boolean(),
  showFurigana: z.boolean(),
  showTranslation: z.boolean(),
  autoPlayAudio: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type CoursePreferences = z.infer<typeof CoursePreferencesSchema>;

export const UpdateCoursePreferencesSchema = z.object({
  showRomaji: z.boolean().optional(),
  showFurigana: z.boolean().optional(),
  showTranslation: z.boolean().optional(),
  autoPlayAudio: z.boolean().optional(),
});
export type UpdateCoursePreferencesDTO = z.input<typeof UpdateCoursePreferencesSchema>;

// --- Agregados para a UI ---------------------------------------------------------

export interface TodayStudySummary {
  minutesStudied: number;
  goalMinutes: number;
  goalMet: boolean;
}

export interface LearningDashboard {
  courses: Course[];
  modulesByCourse: Record<string, LearningModule[]>;
  preferences: LearningPreferences;
  today: TodayStudySummary;
  activeSession: StudySession | null;
  recentSessions: StudySession[];
}

// --- Regras puras (sem I/O) ------------------------------------------------------

/**
 * Soma os minutos de sessões CONCLUÍDAS cujo dia local de início é `today`
 * (formato YYYY-MM-DD, ex.: `todayDateStr()`). O dia local de cada sessão é
 * calculado pelo chamador com os utilitários de `@/lib/dates` (nunca aqui,
 * para manter esta função pura e testável sem fuso horário implícito).
 */
export function computeStudiedMinutes(sessions: StudySession[], today: string, localDayOf: (iso: string) => string): number {
  return sessions
    .filter((s) => s.status === 'completed' && localDayOf(s.startedAt) === today)
    .reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
}

/** Meta diária concluída assim que o total estudado hoje atinge a meta. */
export function isDailyGoalMet(minutesStudied: number, goalMinutes: number): boolean {
  return minutesStudied >= goalMinutes;
}

/**
 * Progresso estrutural honesto do curso: proporção de módulos concluídos.
 * Nunca deriva "domínio linguístico" de tempo estudado — apenas unidades
 * realmente concluídas. Sem módulos concluídos, retorna 0.
 */
export function computeCourseProgress(modules: LearningModule[]): number {
  if (modules.length === 0) return 0;
  const completed = modules.filter((m) => m.status === 'completed').length;
  return Math.round((completed / modules.length) * 100);
}

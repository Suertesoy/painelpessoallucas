import { z } from 'zod';
import { isoDateTimeSchema } from '@/lib/zod-datetime';
import type { CountdownState } from '@/lib/timer';

/**
 * Treinos — programa de academia compartilhado, desempenho individual.
 *
 * Modelo (temporário, compatível com o compartilhamento futuro de workspace):
 * - A ROTINA (dias A–E e seus exercícios) é do workspace e compartilhada.
 * - Cada ATLETA (Lucas, Matheus) é uma linha de `workout_athletes` dentro do
 *   workspace. `userId` fica nulo agora e passa a apontar para o usuário
 *   autenticado quando o convite/associação existir — nenhuma tabela de
 *   desempenho precisa mudar nesse dia.
 * - CARGAS atuais, SESSÕES, SÉRIES e PESO CORPORAL referenciam o atleta, nunca
 *   o usuário logado: os históricos dos dois permanecem separados.
 */

const dayStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD');
const optionalText = (max: number) => z.string().trim().max(max).optional();
const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => /^https?:\/\//i.test(v), 'O link precisa começar com http:// ou https://')
  .optional();

// --- Atleta -----------------------------------------------------------------

export const WorkoutAthleteSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  /** Reservado: usuário autenticado associado a este atleta (convites). */
  userId: z.string().uuid().optional(),
  position: z.number().int().min(0),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type WorkoutAthlete = z.infer<typeof WorkoutAthleteSchema>;

// --- Dia de treino (A–E) ------------------------------------------------------

export const WorkoutDaySchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  /** "A", "B"… Identidade estável do dia na planilha original. */
  code: z.string().trim().min(1).max(4),
  title: optionalText(80),
  position: z.number().int().min(0),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type WorkoutDay = z.infer<typeof WorkoutDaySchema>;

export const DEFAULT_WORKOUT_DAY_CODES = ['A', 'B', 'C', 'D', 'E'] as const;

// --- Exercício ------------------------------------------------------------------

export const MAX_REST_SECONDS = 30 * 60;

export const WorkoutExerciseSchema = z
  .object({
    id: z.string().uuid(),
    workspaceId: z.string().uuid(),
    dayId: z.string().uuid(),
    /** Ordem prescrita dentro do dia (0 = primeiro). */
    position: z.number().int().min(0),
    name: z.string().trim().min(1, 'Informe o nome do exercício').max(120),
    sets: z.number().int().min(1, 'Pelo menos 1 série').max(20),
    repsMin: z.number().int().min(1).max(999).optional(),
    repsMax: z.number().int().min(1).max(999).optional(),
    /** Observação sobre as repetições (ex.: "cada perna", "2s topo, 2s exc", "10 min"). */
    repsNote: optionalText(120),
    /** Descanso sugerido em segundos (valor usado no cronômetro). */
    restSeconds: z.number().int().min(0).max(MAX_REST_SECONDS).optional(),
    /** Descanso como escrito na planilha (ex.: "60-90 seg") — só informação. */
    restNote: optionalText(60),
    /** Instruções curtas de execução. */
    instructions: optionalText(1000),
    /** Referência visual: link de imagem (https). */
    imageUrl: optionalUrl,
    /** Vídeo demonstrativo: link (https). */
    videoUrl: optionalUrl,
    /** Origem do dado (ex.: "planilha Treino Marcio Seco 2 — dia B"). */
    sourceNote: optionalText(500),
    /** true = valor ambíguo da planilha ainda não confirmado pelo usuário. */
    needsReview: z.boolean(),
    /** Ocultar é reversível: fora da execução do treino, disponível na rotina. Não é excluir nem concluir. */
    hiddenAt: isoDateTimeSchema.optional(),
    /** Remoção lógica: o histórico de séries continua referenciando o exercício. */
    removedAt: isoDateTimeSchema.optional(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .superRefine((e, ctx) => {
    if (e.repsMin != null && e.repsMax != null && e.repsMin > e.repsMax) {
      ctx.addIssue({ code: 'custom', message: 'Repetições mínimas maiores que as máximas', path: ['repsMin'] });
    }
  });
export type WorkoutExercise = z.infer<typeof WorkoutExerciseSchema>;

/** Campos editáveis pelo usuário ao criar/editar um exercício. */
export const SaveExerciseSchema = z.object({
  id: z.string().uuid().optional(),
  dayId: z.string().uuid(),
  name: z.string().trim().min(1, 'Informe o nome do exercício').max(120),
  sets: z.number().int().min(1, 'Pelo menos 1 série').max(20),
  repsMin: z.number().int().min(1).max(999).optional(),
  repsMax: z.number().int().min(1).max(999).optional(),
  repsNote: optionalText(120),
  restSeconds: z.number().int().min(0).max(MAX_REST_SECONDS).optional(),
  restNote: optionalText(60),
  instructions: optionalText(1000),
  imageUrl: optionalUrl,
  videoUrl: optionalUrl,
});
export type SaveExerciseDTO = z.input<typeof SaveExerciseSchema>;

// --- Carga atual por atleta -----------------------------------------------------

export const MAX_LOAD_KG = 1000;

export const ExerciseLoadSchema = z.object({
  workspaceId: z.string().uuid(),
  exerciseId: z.string().uuid(),
  athleteId: z.string().uuid(),
  /** Carga atual em kg; ausente = ainda não definida (nunca 0 por padrão). */
  loadKg: z.number().min(0).max(MAX_LOAD_KG).optional(),
  /** Texto livre quando a carga não é um número simples (ex.: "20x20"). */
  loadNote: optionalText(60),
  updatedAt: isoDateTimeSchema,
});
export type ExerciseLoad = z.infer<typeof ExerciseLoadSchema>;

export const SetExerciseLoadSchema = z.object({
  exerciseId: z.string().uuid(),
  athleteId: z.string().uuid(),
  loadKg: z.number().min(0, 'A carga não pode ser negativa').max(MAX_LOAD_KG).optional(),
  loadNote: optionalText(60),
});
export type SetExerciseLoadDTO = z.input<typeof SetExerciseLoadSchema>;

// --- Sessão de treino -------------------------------------------------------------

export const WorkoutSessionStatusSchema = z.enum(['in_progress', 'completed', 'cancelled']);
export type WorkoutSessionStatus = z.infer<typeof WorkoutSessionStatusSchema>;

export const WorkoutSessionSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  athleteId: z.string().uuid(),
  dayId: z.string().uuid(),
  /** Dia LOCAL do treino (YYYY-MM-DD) — nunca derivado de UTC. */
  sessionDate: dayStringSchema,
  startedAt: isoDateTimeSchema,
  endedAt: isoDateTimeSchema.optional(),
  status: WorkoutSessionStatusSchema,
  /** Cronômetro de descanso persistido (sobrevive a recarregar/navegar). */
  restEndsAt: isoDateTimeSchema.optional(),
  restDurationSeconds: z.number().int().min(0).max(MAX_REST_SECONDS).optional(),
  /** Segundos restantes congelados quando o descanso está pausado. */
  restPausedRemainingSeconds: z.number().int().min(0).max(MAX_REST_SECONDS).optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type WorkoutSession = z.infer<typeof WorkoutSessionSchema>;

export function restCountdownOf(session: WorkoutSession): CountdownState {
  return {
    endsAt: session.restEndsAt ?? null,
    pausedRemainingSeconds: session.restPausedRemainingSeconds ?? null,
  };
}

// --- Série registrada ---------------------------------------------------------------

export const SetLogSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  sessionId: z.string().uuid(),
  athleteId: z.string().uuid(),
  exerciseId: z.string().uuid(),
  setNumber: z.number().int().min(1).max(30),
  /** Carga usada; ausente = sem carga (peso do corpo/ilegível). */
  loadKg: z.number().min(0).max(MAX_LOAD_KG).optional(),
  reps: z.number().int().min(0).max(999),
  completedAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
});
export type SetLog = z.infer<typeof SetLogSchema>;

export const LogSetSchema = z.object({
  exerciseId: z.string().uuid(),
  setNumber: z.number().int().min(1).max(30),
  loadKg: z.number().min(0, 'A carga não pode ser negativa').max(MAX_LOAD_KG).optional(),
  reps: z.number().int('Repetições devem ser um número inteiro').min(0, 'Repetições não podem ser negativas').max(999),
});
export type LogSetDTO = z.input<typeof LogSetSchema>;

// --- Peso corporal --------------------------------------------------------------------

export const BodyWeightLogSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  athleteId: z.string().uuid(),
  weightKg: z.number().min(20, 'Peso abaixo de 20 kg').max(400, 'Peso acima de 400 kg'),
  loggedOn: dayStringSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type BodyWeightLog = z.infer<typeof BodyWeightLogSchema>;

export const LogBodyWeightSchema = z.object({
  athleteId: z.string().uuid(),
  weightKg: z.number().min(20, 'Peso abaixo de 20 kg').max(400, 'Peso acima de 400 kg'),
  loggedOn: dayStringSchema.optional(),
});
export type LogBodyWeightDTO = z.input<typeof LogBodyWeightSchema>;

// --- Regras puras ----------------------------------------------------------------------

/** "3×8–12", "2×15", "3×10–15 · cada perna". */
export function formatPrescription(e: Pick<WorkoutExercise, 'sets' | 'repsMin' | 'repsMax' | 'repsNote'>): string {
  const reps =
    e.repsMin != null && e.repsMax != null && e.repsMin !== e.repsMax
      ? `${e.repsMin}–${e.repsMax}`
      : e.repsMax != null || e.repsMin != null
        ? String(e.repsMax ?? e.repsMin)
        : null;
  const base = reps ? `${e.sets}×${reps}` : `${e.sets} série${e.sets > 1 ? 's' : ''}`;
  return e.repsNote ? `${base} · ${e.repsNote}` : base;
}

export function formatLoad(load: Pick<ExerciseLoad, 'loadKg' | 'loadNote'> | undefined | null): string {
  if (!load) return '—';
  if (load.loadKg != null) return `${formatKg(load.loadKg)} kg`;
  return load.loadNote ? load.loadNote : '—';
}

export function formatKg(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}

export function formatRest(seconds: number | undefined): string {
  if (seconds == null) return 'sem descanso definido';
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} min` : `${m} min ${s} s`;
}

/** Descanso padrão quando o exercício não define um. */
export const DEFAULT_REST_SECONDS = 90;

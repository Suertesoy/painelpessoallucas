import { z } from 'zod';
import { isoDateTimeSchema } from '@/lib/zod-datetime';

/**
 * Prática de repetição (Estudos). Cada "item" é uma HABILIDADE sobre um
 * conteúdo já estudado — ler o kana, reconhecê-lo pelo som, escrevê-lo ou
 * completar uma palavra. Cada habilidade tem seu próprio agendamento de
 * revisão espaçada (1, 3, 7 e 14 dias), então errar a escrita de あ não
 * reinicia a leitura de あ.
 *
 * `script` prepara Katakana e Kanji: o item é identificado por
 * (kind, subject) e o `subject` é o próprio caractere/palavra, de modo que
 * um novo sistema de escrita entra como novos conteúdos, sem mudar o modelo.
 */
export const PracticeItemKindSchema = z.enum([
  'kana_read', // kana -> som (ler / digitar a leitura)
  'kana_hear', // som -> kana (reconhecer pelo som ou pela escuta)
  'kana_write', // escrever o kana à mão
  'word_fill', // completar palavra
]);
export type PracticeItemKind = z.infer<typeof PracticeItemKindSchema>;

export const PracticeScriptSchema = z.enum(['hiragana', 'katakana', 'kanji']);
export type PracticeScript = z.infer<typeof PracticeScriptSchema>;

const dayStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD');

export const PracticeItemSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  courseId: z.string().uuid(),
  kind: PracticeItemKindSchema,
  script: PracticeScriptSchema,
  subject: z.string().min(1),
  /** Caixa de Leitner: 0 = errou/novo (revisar hoje); 1..4 = acertos em dias distintos. */
  box: z.number().int().min(0).max(4),
  /** Próxima revisão (dia local). */
  dueOn: dayStringSchema,
  lastReviewedOn: dayStringSchema.optional(),
  attempts: z.number().int().min(0),
  correctCount: z.number().int().min(0),
  lapses: z.number().int().min(0),
  lastResult: z.enum(['correct', 'incorrect']).optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type PracticeItem = z.infer<typeof PracticeItemSchema>;

export const RecordPracticeResultSchema = z.object({
  kind: PracticeItemKindSchema,
  script: PracticeScriptSchema.default('hiragana'),
  subject: z.string().min(1),
  correct: z.boolean(),
});
export type RecordPracticeResultDTO = z.input<typeof RecordPracticeResultSchema>;

/** Intervalos de revisão espaçada, em dias, por acerto consecutivo (dias distintos). */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14] as const;
export const MAX_BOX = REVIEW_INTERVALS_DAYS.length; // 4 = "fixado": segue revisando a cada 14 dias

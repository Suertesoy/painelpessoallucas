import { z } from 'zod';

/**
 * Learning Content Engine — modelo declarativo de conteúdo de lição (Fase 2
 * do módulo Aprendizado).
 *
 * Uma lição é uma sequência de blocos tipados (`LessonBlock`). O React nunca
 * conhece uma lição específica: `LessonRenderer` percorre `blocks` e delega
 * a renderização de cada um ao componente registrado para `block.type`. Um
 * curso novo (japonês, inglês, o que for) é só um novo arquivo de conteúdo
 * em `modules/learning/content/` — nunca um novo componente React.
 *
 * Toda lição começa com um bloco `objective` e termina com um bloco
 * `summary` (validado abaixo) — garante que "objetivo" e "resumo" nunca
 * dependam de disciplina de quem escreve o conteúdo.
 */

const LessonBlockBaseSchema = z.object({
  /** Único dentro da lição — usado como React key e para correlacionar
   * resultados de exercício (`ExerciseResult.blockId`) ao bloco de origem. */
  id: z.string().min(1),
});

// --- Blocos de conteúdo ----------------------------------------------------

export const ObjectiveBlockSchema = LessonBlockBaseSchema.extend({
  type: z.literal('objective'),
  text: z.string().min(1),
});
export type ObjectiveBlock = z.infer<typeof ObjectiveBlockSchema>;

export const TextBlockSchema = LessonBlockBaseSchema.extend({
  type: z.literal('text'),
  heading: z.string().optional(),
  paragraphs: z.array(z.string().min(1)).min(1),
});
export type TextBlock = z.infer<typeof TextBlockSchema>;

const KanaCharacterSchema = z.object({
  /** O caractere em si (ex.: "あ"). Sempre o dado bruto, nunca só um label
   * visual — é o que permite gerar artefatos futuros (flashcards etc.) a
   * partir do mesmo bloco, sem reescrever conteúdo. */
  character: z.string().min(1),
  romaji: z.string().min(1),
});
export type KanaCharacter = z.infer<typeof KanaCharacterSchema>;

export const KanaBlockSchema = LessonBlockBaseSchema.extend({
  type: z.literal('kana'),
  heading: z.string().optional(),
  characters: z.array(KanaCharacterSchema).min(1),
});
export type KanaBlock = z.infer<typeof KanaBlockSchema>;

const ExampleItemSchema = z.object({
  text: z.string().min(1),
  /** Leitura em romaji da palavra/frase inteira — apoio temporário, gated
   * pela preferência `showRomaji` do curso. Distinto de `note`, que é um
   * comentário pedagógico livre (ex.: decomposição em sílabas) sempre
   * visível, independente da preferência de romaji. */
  romaji: z.string().optional(),
  translation: z.string().optional(),
  note: z.string().optional(),
});
export type ExampleItem = z.infer<typeof ExampleItemSchema>;

export const ExampleBlockSchema = LessonBlockBaseSchema.extend({
  type: z.literal('example'),
  heading: z.string().optional(),
  items: z.array(ExampleItemSchema).min(1),
});
export type ExampleBlock = z.infer<typeof ExampleBlockSchema>;

export const NoteToneSchema = z.enum(['info', 'tip', 'warning']);
export type NoteTone = z.infer<typeof NoteToneSchema>;

export const NoteBlockSchema = LessonBlockBaseSchema.extend({
  type: z.literal('note'),
  tone: NoteToneSchema.default('info'),
  text: z.string().min(1),
});
export type NoteBlock = z.infer<typeof NoteBlockSchema>;

export const SummaryBlockSchema = LessonBlockBaseSchema.extend({
  type: z.literal('summary'),
  points: z.array(z.string().min(1)).min(1),
});
export type SummaryBlock = z.infer<typeof SummaryBlockSchema>;

// --- Blocos de exercício ----------------------------------------------------
//
// Todo bloco de exercício produz um `ExerciseResult` padronizado (ver
// abaixo) quando respondido — mesmo contrato para qualquer tipo de
// exercício presente ou futuro, o que permite a `LessonRenderer` agregar
// progresso sem conhecer o exercício específico.

const MultipleChoiceOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});
export type MultipleChoiceOption = z.infer<typeof MultipleChoiceOptionSchema>;

export const MultipleChoiceBlockSchema = LessonBlockBaseSchema.extend({
  type: z.literal('multiple_choice'),
  prompt: z.string().min(1),
  options: z.array(MultipleChoiceOptionSchema).min(2),
  correctOptionId: z.string().min(1),
  explanation: z.string().optional(),
});
export type MultipleChoiceBlock = z.infer<typeof MultipleChoiceBlockSchema>;

const MatchingPairSchema = z.object({
  id: z.string().min(1),
  left: z.string().min(1),
  right: z.string().min(1),
});
export type MatchingPair = z.infer<typeof MatchingPairSchema>;

export const MatchingBlockSchema = LessonBlockBaseSchema.extend({
  type: z.literal('matching'),
  prompt: z.string().min(1),
  pairs: z.array(MatchingPairSchema).min(2),
});
export type MatchingBlock = z.infer<typeof MatchingBlockSchema>;

/** Tipos de bloco que produzem um `ExerciseResult` ao serem respondidos. */
export const EXERCISE_BLOCK_TYPES = ['multiple_choice', 'matching'] as const;
export type ExerciseBlockType = (typeof EXERCISE_BLOCK_TYPES)[number];

// --- União de blocos ---------------------------------------------------------

export const LessonBlockSchema = z
  .discriminatedUnion('type', [
    ObjectiveBlockSchema,
    TextBlockSchema,
    KanaBlockSchema,
    ExampleBlockSchema,
    NoteBlockSchema,
    MultipleChoiceBlockSchema,
    MatchingBlockSchema,
    SummaryBlockSchema,
  ])
  .superRefine((block, ctx) => {
    if (block.type === 'multiple_choice') {
      const optionIds = block.options.map((o) => o.id);
      if (new Set(optionIds).size !== optionIds.length) {
        ctx.addIssue({ code: 'custom', message: 'IDs de opção duplicados em bloco multiple_choice' });
      }
      if (!optionIds.includes(block.correctOptionId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'correctOptionId precisa referenciar uma das options do bloco',
          path: ['correctOptionId'],
        });
      }
    }
    if (block.type === 'matching') {
      const pairIds = block.pairs.map((p) => p.id);
      if (new Set(pairIds).size !== pairIds.length) {
        ctx.addIssue({ code: 'custom', message: 'IDs de par duplicados em bloco matching' });
      }
    }
  });
export type LessonBlock = z.infer<typeof LessonBlockSchema>;

/** Tipo de cada bloco suportado — fonte única para telas/documentação que
 * precisem listar os tipos disponíveis (ex.: editor futuro). */
export const LESSON_BLOCK_TYPES = [
  'objective',
  'text',
  'kana',
  'example',
  'note',
  'multiple_choice',
  'matching',
  'summary',
] as const;

// --- Conteúdo da lição ---------------------------------------------------------

/**
 * Toda lição deve começar com um bloco `objective` e terminar com um bloco
 * `summary` — garante a estrutura "objetivo → conteúdo/exercícios →
 * resumo" descrita na arquitetura do motor, sem depender de convenção.
 */
export const LessonContentSchema = z
  .object({
    blocks: z.array(LessonBlockSchema).min(1),
  })
  .superRefine((content, ctx) => {
    const { blocks } = content;
    const blockIds = blocks.map((b) => b.id);
    if (new Set(blockIds).size !== blockIds.length) {
      ctx.addIssue({ code: 'custom', message: 'IDs de bloco duplicados na lição', path: ['blocks'] });
    }
    if (blocks[0]?.type !== 'objective') {
      ctx.addIssue({
        code: 'custom',
        message: 'A lição precisa começar com um bloco do tipo "objective"',
        path: ['blocks', 0],
      });
    }
    if (blocks[blocks.length - 1]?.type !== 'summary') {
      ctx.addIssue({
        code: 'custom',
        message: 'A lição precisa terminar com um bloco do tipo "summary"',
        path: ['blocks', blocks.length - 1],
      });
    }
  });
export type LessonContent = z.infer<typeof LessonContentSchema>;

// --- Resultado padronizado de exercício -----------------------------------------

export const ExerciseOutcomeSchema = z.enum(['correct', 'incorrect']);
export type ExerciseOutcome = z.infer<typeof ExerciseOutcomeSchema>;

/**
 * Resultado padronizado que qualquer bloco de exercício produz ao ser
 * respondido. Não é persistido nesta fase (sem SRS ainda) — hoje só
 * alimenta o progresso exibido dentro de `LessonRenderer` — mas o formato
 * já é o contrato que uma futura fase de revisão espaçada consumiria.
 */
export const ExerciseResultSchema = z.object({
  blockId: z.string().min(1),
  outcome: ExerciseOutcomeSchema,
});
export type ExerciseResult = z.infer<typeof ExerciseResultSchema>;

import type { ComponentType } from 'react';
import type { LessonBlock } from '@/modules/learning/domain/lesson-content.schema';
import type { LessonBlockViewProps } from './types';
import { ObjectiveBlockView } from './objective-block';
import { TextBlockView } from './text-block';
import { KanaBlockView } from './kana-block';
import { ExampleBlockView } from './example-block';
import { NoteBlockView } from './note-block';
import { MultipleChoiceBlockView } from './multiple-choice-block';
import { MatchingBlockView } from './matching-block';
import { SummaryBlockView } from './summary-block';

export type { LessonBlockViewProps } from './types';

/**
 * Registro único tipo de bloco → componente. Adicionar um tipo de bloco
 * novo é: 1) schema em `lesson-content.schema.ts`, 2) componente aqui,
 * 3) uma entrada nesta tabela — `LessonRenderer` nunca muda.
 */
export const LESSON_BLOCK_COMPONENTS: {
  [K in LessonBlock['type']]: ComponentType<LessonBlockViewProps<Extract<LessonBlock, { type: K }>>>;
} = {
  objective: ObjectiveBlockView,
  text: TextBlockView,
  kana: KanaBlockView,
  example: ExampleBlockView,
  note: NoteBlockView,
  multiple_choice: MultipleChoiceBlockView,
  matching: MatchingBlockView,
  summary: SummaryBlockView,
};

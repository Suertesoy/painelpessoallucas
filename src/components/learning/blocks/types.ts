import type { ExerciseResult, LessonBlock } from '@/modules/learning/domain/lesson-content.schema';
import type { ExerciseAttempt } from '@/modules/learning/domain/lesson-progress.schema';

/** Props que todo componente de bloco recebe. `onExerciseResult` e
 * `attempt` só são usados pelos blocos de exercício (multiple_choice,
 * matching); os demais os ignoram.
 *
 * `attempt`: estado acumulado persistido para este `block.id` (undefined =
 * nunca tentado). Aprendizagem, não avaliação — uma resposta incorreta
 * (`attempt.resolvedAt` ausente) não trava o bloco, ele continua
 * respondível; só trava quando `resolvedAt` está definido (resolvido). Como
 * só o resultado agregado é persistido, não qual opção/par específico foi
 * escolhido em cada tentativa, o bloco resolvido mostra a resposta correta
 * (dado estático do conteúdo), não a interação exata replay. */
export interface LessonBlockViewProps<B extends LessonBlock = LessonBlock> {
  block: B;
  onExerciseResult?: (result: ExerciseResult) => void;
  attempt?: ExerciseAttempt;
  /** Preferência `CoursePreferences.showRomaji` do curso — só usada pelos
   * blocos `kana` e `example`, que têm romaji como apoio de leitura.
   * `undefined`/`true` mostra romaji (apoio visível por padrão); só `false`
   * oculta. Os demais blocos ignoram esta prop. */
  showRomaji?: boolean;
}

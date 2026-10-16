import { addDays, format, parseISO } from 'date-fns';
import { MAX_BOX, REVIEW_INTERVALS_DAYS, type PracticeItem } from './practice.schema';

/** Soma `days` a um dia local YYYY-MM-DD (sem passar por UTC). */
export function addDaysToDateStr(day: string, days: number): string {
  return format(addDays(parseISO(`${day}T00:00:00`), days), 'yyyy-MM-dd');
}

/**
 * Dia da próxima revisão depois de um ACERTO que levou o item à caixa `newBox`
 * (1 → +1 dia, 2 → +3, 3 → +7, 4 ou mais → +14).
 */
export function nextDueAfterCorrect(newBox: number, today: string): string {
  const index = Math.min(Math.max(newBox, 1), REVIEW_INTERVALS_DAYS.length) - 1;
  return addDaysToDateStr(today, REVIEW_INTERVALS_DAYS[index]);
}

export interface PracticeProgressFields {
  box: number;
  dueOn: string;
  lastReviewedOn?: string;
  attempts: number;
  correctCount: number;
  lapses: number;
  lastResult?: 'correct' | 'incorrect';
}

/**
 * Aplica o resultado de uma resposta ao agendamento.
 * - Erro: volta à caixa 0 e fica devido HOJE (reforço do erro na mesma rodada
 *   e na próxima visita), contando um "lapso".
 * - Acerto: só avança de caixa UMA vez por dia local. Acertar o mesmo item
 *   várias vezes no mesmo dia é prática extra — não acelera a progressão.
 */
export function applyPracticeResult(
  state: PracticeProgressFields | null,
  correct: boolean,
  today: string
): PracticeProgressFields {
  const base: PracticeProgressFields = state ?? {
    box: 0,
    dueOn: today,
    attempts: 0,
    correctCount: 0,
    lapses: 0,
  };
  const attempts = base.attempts + 1;

  if (!correct) {
    return {
      ...base,
      box: 0,
      dueOn: today,
      lastReviewedOn: today,
      attempts,
      lapses: base.lapses + 1,
      lastResult: 'incorrect',
    };
  }

  const alreadyAdvancedToday = base.lastReviewedOn === today && base.lastResult === 'correct' && base.box > 0;
  const box = alreadyAdvancedToday ? base.box : Math.min(base.box + 1, MAX_BOX);
  return {
    ...base,
    box,
    dueOn: alreadyAdvancedToday ? base.dueOn : nextDueAfterCorrect(box, today),
    lastReviewedOn: today,
    attempts,
    correctCount: base.correctCount + 1,
    lastResult: 'correct',
  };
}

export function isDue(item: Pick<PracticeItem, 'dueOn'>, today: string): boolean {
  return item.dueOn <= today;
}

/** Item que o último resultado foi erro e ainda não foi acertado depois. */
export function isErrorItem(item: Pick<PracticeItem, 'box' | 'lastResult'>): boolean {
  return item.box === 0 && item.lastResult === 'incorrect';
}

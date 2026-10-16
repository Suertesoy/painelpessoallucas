import type { Lesson } from '../domain/learning.schema';
import type { LessonProgress } from '../domain/lesson-progress.schema';

/**
 * Conteúdo "já estudado": a prática só pode usar símbolos que o aluno já
 * viu em lições. Uma lição conta como estudada quando existe progresso para
 * ela (aberta ou concluída) — a ausência de progresso É "não iniciada".
 * Nada de símbolos de lições futuras entra nos exercícios.
 */

export interface KnownKana {
  character: string;
  romaji: string;
  /** Lição em que o kana foi apresentado pela primeira vez. */
  lessonKey: string;
}

export interface KnownWord {
  text: string;
  romaji?: string;
  translation?: string;
}

/** Caracteres que acompanham palavras mas não são "kana de resposta". */
const PUNCTUATION = /[\s、。！？!?,.・「」『』〜~…]/g;
const SMALL_OR_MARK = new Set(['ゃ', 'ゅ', 'ょ', 'っ', 'ー', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ']);

export function studiedLessons(lessons: Lesson[], progress: LessonProgress[]): Lesson[] {
  const started = new Set(progress.map((p) => p.lessonId));
  return lessons.filter((l) => started.has(l.id));
}

/** Kana dos blocos `kana` das lições estudadas, sem duplicatas, na ordem do curso. */
export function collectKnownKana(lessons: Lesson[]): KnownKana[] {
  const seen = new Set<string>();
  const result: KnownKana[] = [];
  for (const lesson of lessons) {
    for (const block of lesson.content.blocks) {
      if (block.type !== 'kana') continue;
      for (const c of block.characters) {
        if (seen.has(c.character)) continue;
        seen.add(c.character);
        result.push({ character: c.character, romaji: c.romaji, lessonKey: lesson.contentKey });
      }
    }
  }
  return result;
}

/** Todos os code points individuais que o aluno já conhece (inclui ゃ ゅ ょ っ de lições estudadas). */
export function knownCharacterSet(kana: KnownKana[]): Set<string> {
  const set = new Set<string>();
  for (const k of kana) for (const ch of Array.from(k.character)) set.add(ch);
  return set;
}

/** true quando TODOS os caracteres do texto (sem pontuação) já foram ensinados. */
export function isTextComposedOfKnownKana(text: string, known: Set<string>): boolean {
  const clean = Array.from(text.replace(PUNCTUATION, ''));
  if (clean.length === 0) return false;
  return clean.every((ch) => known.has(ch) || (ch === 'ー' && known.has('ー')));
}

/**
 * Palavras e frases curtas dos blocos `example` das lições estudadas que
 * usam apenas kana já ensinados. Frases com kanji ou kana ainda não vistos
 * são descartadas — preferimos menos exemplos a introduzir símbolos novos.
 */
export function collectKnownWords(lessons: Lesson[], known: Set<string>): KnownWord[] {
  const seen = new Set<string>();
  const result: KnownWord[] = [];
  for (const lesson of lessons) {
    for (const block of lesson.content.blocks) {
      if (block.type !== 'example') continue;
      for (const item of block.items) {
        if (seen.has(item.text)) continue;
        if (!isTextComposedOfKnownKana(item.text, known)) continue;
        seen.add(item.text);
        result.push({ text: item.text, romaji: item.romaji, translation: item.translation });
      }
    }
  }
  return result;
}

/** Posições de uma palavra que podem virar lacuna (kana "cheios" já conhecidos). */
export function blankableIndexes(word: string, known: Set<string>): number[] {
  const chars = Array.from(word);
  const indexes: number[] = [];
  chars.forEach((ch, i) => {
    // Não separa um kana do ゃ/ゅ/ょ pequeno que o acompanha (きゃ é um som só).
    const followedBySmallYa = ['ゃ', 'ゅ', 'ょ'].includes(chars[i + 1] ?? '');
    if (known.has(ch) && !SMALL_OR_MARK.has(ch) && !followedBySmallYa) indexes.push(i);
  });
  return indexes;
}

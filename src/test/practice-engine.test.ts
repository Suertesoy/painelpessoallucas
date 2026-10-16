import { describe, it, expect } from 'vitest';
import { applyPracticeResult, nextDueAfterCorrect } from '@/modules/learning/practice/scheduling';
import { canonicalRomaji, isRomajiAnswerCorrect, acceptedRomajiFor } from '@/modules/learning/practice/romaji';
import {
  blankableIndexes,
  collectKnownKana,
  collectKnownWords,
  knownCharacterSet,
  studiedLessons,
} from '@/modules/learning/practice/known-content';
import { buildPracticeSession } from '@/modules/learning/practice/exercises';
import type { PracticeItem } from '@/modules/learning/practice/practice.schema';
import type { Lesson } from '@/modules/learning/domain/learning.schema';
import type { LessonProgress } from '@/modules/learning/domain/lesson-progress.schema';
import vogais from '@/modules/learning/content/hiragana-vogais';
import linhaK from '@/modules/learning/content/hiragana-linha-k';
import linhaS from '@/modules/learning/content/hiragana-linha-s';

const UUID = '8d2facfc-27bf-4736-97c9-b30e70fecfb6';
const NOW = '2026-10-15T12:00:00.000Z';

function lesson(id: string, key: string, content: Lesson['content']): Lesson {
  return { id, workspaceId: UUID, moduleId: UUID, contentKey: key, title: key, position: 0, content, createdAt: NOW, updatedAt: NOW };
}
const L_VOGAIS = lesson('11111111-1111-4111-8111-111111111111', 'hiragana-vogais', vogais);
const L_K = lesson('22222222-2222-4222-8222-222222222222', 'hiragana-linha-k', linhaK);
const L_S = lesson('33333333-3333-4333-8333-333333333333', 'hiragana-linha-s', linhaS);
const progress = (lessonId: string) => ({ lessonId }) as LessonProgress;

describe('revisão espaçada 1-3-7-14', () => {
  it('intervalos por acerto', () => {
    expect(nextDueAfterCorrect(1, '2026-10-15')).toBe('2026-10-16');
    expect(nextDueAfterCorrect(2, '2026-10-15')).toBe('2026-10-18');
    expect(nextDueAfterCorrect(3, '2026-10-15')).toBe('2026-10-22');
    expect(nextDueAfterCorrect(4, '2026-10-15')).toBe('2026-10-29');
    expect(nextDueAfterCorrect(9, '2026-12-31')).toBe('2027-01-14');
  });

  it('acerto em dias distintos avança de caixa; erro volta ao início e vence hoje', () => {
    let s = applyPracticeResult(null, true, '2026-10-15');
    expect(s).toMatchObject({ box: 1, dueOn: '2026-10-16', correctCount: 1 });
    s = applyPracticeResult(s, true, '2026-10-16');
    expect(s).toMatchObject({ box: 2, dueOn: '2026-10-19' });
    s = applyPracticeResult(s, false, '2026-10-19');
    expect(s).toMatchObject({ box: 0, dueOn: '2026-10-19', lapses: 1, lastResult: 'incorrect' });
  });

  it('acertar de novo no mesmo dia NÃO acelera a progressão', () => {
    let s = applyPracticeResult(null, true, '2026-10-15');
    s = applyPracticeResult(s, true, '2026-10-15');
    s = applyPracticeResult(s, true, '2026-10-15');
    expect(s.box).toBe(1);
    expect(s.dueOn).toBe('2026-10-16');
    expect(s.attempts).toBe(3);
  });

  it('erro seguido de acerto no mesmo dia volta para caixa 1', () => {
    let s = applyPracticeResult(null, false, '2026-10-15');
    s = applyPracticeResult(s, true, '2026-10-15');
    expect(s.box).toBe(1);
  });
});

describe('romaji digitado', () => {
  it('aceita grafias Kunrei e Hepburn', () => {
    expect(isRomajiAnswerCorrect('SI', ['shi'])).toBe(true);
    expect(isRomajiAnswerCorrect('tu', ['tsu'])).toBe(true);
    expect(isRomajiAnswerCorrect('hu', ['fu'])).toBe(true);
    expect(isRomajiAnswerCorrect('chi', ['chi'])).toBe(true);
    expect(isRomajiAnswerCorrect('zi', ['ji'])).toBe(true);
    expect(isRomajiAnswerCorrect('sya', ['sha'])).toBe(true);
    expect(canonicalRomaji(' Shī ')).toBe('shi');
  });
  it('rejeita resposta errada ou vazia', () => {
    expect(isRomajiAnswerCorrect('ka', ['ki'])).toBe(false);
    expect(isRomajiAnswerCorrect('  ', ['ki'])).toBe(false);
  });
  it('を e ん têm leituras extras', () => {
    expect(isRomajiAnswerCorrect('o', acceptedRomajiFor('を', 'wo'))).toBe(true);
    expect(isRomajiAnswerCorrect('nn', acceptedRomajiFor('ん', 'n'))).toBe(true);
  });
});

describe('conteúdo conhecido (sem símbolos futuros)', () => {
  it('só lições com progresso entram', () => {
    const studied = studiedLessons([L_VOGAIS, L_K, L_S], [progress(L_VOGAIS.id)]);
    expect(studied.map((l) => l.contentKey)).toEqual(['hiragana-vogais']);
    const kana = collectKnownKana(studied);
    expect(kana.map((k) => k.character)).toEqual(['あ', 'い', 'う', 'え', 'お']);
  });

  it('palavras só usam kana já ensinados', () => {
    const studied = studiedLessons([L_VOGAIS, L_K, L_S], [progress(L_VOGAIS.id), progress(L_K.id)]);
    const known = knownCharacterSet(collectKnownKana(studied));
    const words = collectKnownWords(studied, known);
    for (const w of words) for (const ch of Array.from(w.text)) expect(known.has(ch)).toBe(true);
    // あか (vogal + K) deve existir; palavras com さ/し/す... não
    expect(words.some((w) => w.text === 'あか')).toBe(true);
  });

  it('lacuna não separa kana de ゃ pequeno', () => {
    const known = new Set(['き', 'ゃ', 'あ']);
    expect(blankableIndexes('きゃあ', known)).toEqual([2]);
  });
});

describe('gerador de rodada', () => {
  const studied = [L_VOGAIS, L_K];
  const kana = collectKnownKana(studied);
  const words = collectKnownWords(studied, knownCharacterSet(kana));
  const base = { kana, words, items: [] as PracticeItem[], today: '2026-10-15', rng: seeded(7) };

  function seeded(seed: number) {
    let s = seed;
    return () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
  }

  const item = (subject: string, over: Partial<PracticeItem>): PracticeItem => ({
    id: UUID, workspaceId: UUID, courseId: UUID, kind: 'kana_read', script: 'hiragana', subject,
    box: 0, dueOn: '2026-10-15', attempts: 1, correctCount: 0, lapses: 0, createdAt: NOW, updatedAt: NOW, ...over,
  });

  it('sem kana conhecido não há exercícios', () => {
    expect(buildPracticeSession({ ...base, kana: [], words: [] })).toEqual([]);
  });

  it('nenhuma pergunta usa símbolo fora do conteúdo estudado', () => {
    const allowed = knownCharacterSet(kana);
    const questions = buildPracticeSession({ ...base, listening: true });
    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions) {
      for (const ch of Array.from(q.subject)) expect(allowed.has(ch)).toBe(true);
      for (const c of q.choices ?? []) {
        if (/[぀-ヿ]/.test(c.label)) for (const ch of Array.from(c.label)) expect(allowed.has(ch)).toBe(true);
      }
    }
    expect(JSON.stringify(questions)).not.toMatch(/[さしすせそ]/);
  });

  it('limita itens novos por rodada', () => {
    const questions = buildPracticeSession({ ...base, maxNew: 2 });
    expect(questions.filter((q) => q.reason === 'new').length).toBeLessThanOrEqual(2);
  });

  it('erros vêm primeiro; modo errors só traz erros', () => {
    const items = [item('き', { box: 0, lastResult: 'incorrect' }), item('あ', { box: 2, dueOn: '2026-10-20', lastResult: 'correct' })];
    const mixed = buildPracticeSession({ ...base, items });
    expect(mixed[0].subject).toBe('き');
    expect(mixed[0].reason).toBe('error');
    const errors = buildPracticeSession({ ...base, items, mode: 'errors' });
    expect(errors.map((q) => q.subject)).toEqual(['き']);
  });

  it('modo review traz só o vencido, e vazio quando nada vence', () => {
    const due = item('あ', { box: 1, dueOn: '2026-10-14', lastResult: 'correct' });
    const later = item('い', { box: 1, dueOn: '2026-10-30', lastResult: 'correct' });
    expect(buildPracticeSession({ ...base, items: [due, later], mode: 'review' }).map((q) => q.subject)).toEqual(['あ']);
    expect(buildPracticeSession({ ...base, items: [later], mode: 'review' })).toEqual([]);
  });

  it('perguntas de múltipla escolha têm a resposta correta entre as opções', () => {
    for (const q of buildPracticeSession({ ...base })) {
      if (q.choices) expect(q.choices.some((c) => c.id === q.correctChoiceId)).toBe(true);
      else expect(q.acceptedAnswers?.length).toBeGreaterThan(0);
    }
  });
});

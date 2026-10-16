import {
  blankableIndexes,
  knownCharacterSet,
  type KnownKana,
  type KnownWord,
} from './known-content';
import { acceptedRomajiFor } from './romaji';
import { isDue, isErrorItem } from './scheduling';
import type { PracticeItem, PracticeItemKind } from './practice.schema';

/**
 * Gerador de exercícios de prática. Função pura: recebe o conteúdo já
 * estudado + o estado de revisão e devolve a fila de perguntas — sem I/O,
 * testável com `rng` determinístico.
 */

export type PracticeQuestionType =
  | 'kana_to_sound' // mostra kana, escolhe o som
  | 'sound_to_kana' // mostra o som (romaji), escolhe o kana
  | 'type_answer' // mostra kana, digita o romaji
  | 'listen_to_kana' // ouve o kana, escolhe o kana
  | 'complete_word'; // completa a palavra

export type PracticeMode = 'mixed' | 'review' | 'errors' | 'listen' | 'type';

export interface PracticeChoice {
  id: string;
  label: string;
}

export interface PracticeQuestion {
  /** Estável dentro da rodada. */
  id: string;
  type: PracticeQuestionType;
  /** Habilidade que será agendada/registrada ao responder. */
  itemKind: PracticeItemKind;
  /** Kana ou palavra de origem (chave do item de revisão). */
  subject: string;
  prompt: string;
  /** Texto grande exibido no cartão (kana, som, palavra com lacuna). */
  display: string;
  /** Texto para a voz japonesa, quando a pergunta tem áudio. */
  speak?: string;
  choices?: PracticeChoice[];
  correctChoiceId?: string;
  /** Respostas digitadas aceitas (romaji). */
  acceptedAnswers?: string[];
  /** Resposta correta mostrada no feedback. */
  answerLabel: string;
  translation?: string;
  /** Origem na fila — explica por que a pergunta apareceu. */
  reason: 'error' | 'due' | 'new' | 'extra';
}

export interface BuildPracticeInput {
  kana: KnownKana[];
  words: KnownWord[];
  items: PracticeItem[];
  today: string;
  mode?: PracticeMode;
  size?: number;
  /** Máximo de itens nunca praticados por rodada — evita acelerar a progressão. */
  maxNew?: number;
  /** true quando há voz japonesa disponível: o modo misto inclui perguntas de escuta. */
  listening?: boolean;
  rng?: () => number;
}

const DEFAULT_SIZE = 10;
const DEFAULT_MAX_NEW = 3;

function shuffle<T>(list: T[], rng: () => number): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickDistractors<T>(pool: T[], exclude: (item: T) => boolean, count: number, rng: () => number): T[] {
  return shuffle(pool.filter((p) => !exclude(p)), rng).slice(0, count);
}

type Candidate = { itemKind: PracticeItemKind; subject: string; reason: PracticeQuestion['reason'] };

function itemKey(kind: PracticeItemKind, subject: string): string {
  return `${kind}:${subject}`;
}

/** Tipos de pergunta possíveis por modo. */
function typesForMode(mode: PracticeMode, listening: boolean): PracticeQuestionType[] {
  switch (mode) {
    case 'listen':
      return ['listen_to_kana'];
    case 'type':
      return ['type_answer'];
    default:
      return [
        'kana_to_sound',
        'sound_to_kana',
        'type_answer',
        'complete_word',
        ...(listening ? (['listen_to_kana'] as const) : []),
      ];
  }
}

function kindForType(type: PracticeQuestionType): PracticeItemKind {
  switch (type) {
    case 'kana_to_sound':
    case 'type_answer':
      return 'kana_read';
    case 'sound_to_kana':
    case 'listen_to_kana':
      return 'kana_hear';
    case 'complete_word':
      return 'word_fill';
  }
}

/** Monta a fila de perguntas: erros → vencidas → novas (limitadas) → reforço. */
export function buildPracticeSession(input: BuildPracticeInput): PracticeQuestion[] {
  const { kana, words, items, today, mode = 'mixed' } = input;
  const size = input.size ?? DEFAULT_SIZE;
  const maxNew = input.maxNew ?? DEFAULT_MAX_NEW;
  const rng = input.rng ?? Math.random;
  if (kana.length === 0) return [];

  const allowedTypes = typesForMode(mode, input.listening ?? false);
  const known = knownCharacterSet(kana);
  const wordCandidates = words.filter((w) => blankableIndexes(w.text, known).length > 0);
  const canFillWords = allowedTypes.includes('complete_word') && wordCandidates.length > 0;
  const typesWithData = allowedTypes.filter((t) => t !== 'complete_word' || canFillWords);

  const byKey = new Map(items.map((i) => [itemKey(i.kind, i.subject), i]));
  const candidates: Candidate[] = [];
  const taken = new Set<string>();
  const add = (c: Candidate) => {
    const key = itemKey(c.itemKind, c.subject);
    if (taken.has(key)) return;
    taken.add(key);
    candidates.push(c);
  };

  const relevantKinds = new Set(typesWithData.map(kindForType));
  const relevantItems = items.filter((i) => relevantKinds.has(i.kind) && i.kind !== 'kana_write');

  // 1) Erros a reforçar.
  for (const item of shuffle(relevantItems.filter(isErrorItem), rng)) {
    add({ itemKind: item.kind, subject: item.subject, reason: 'error' });
  }
  if (mode !== 'errors') {
    // 2) Revisões espaçadas vencidas (mais atrasadas primeiro).
    const due = relevantItems
      .filter((i) => !isErrorItem(i) && isDue(i, today))
      .sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0));
    for (const item of due) add({ itemKind: item.kind, subject: item.subject, reason: 'due' });

    if (mode !== 'review') {
      // 3) Itens ainda não praticados, em pequena quantidade por rodada.
      let newCount = 0;
      const kindsInUse = [...relevantKinds].filter((k) => k === 'kana_read' || k === 'kana_hear');
      for (const k of shuffle(kana, rng)) {
        if (newCount >= maxNew) break;
        for (const kind of kindsInUse) {
          if (newCount >= maxNew) break;
          if (!byKey.has(itemKey(kind, k.character)) && !taken.has(itemKey(kind, k.character))) {
            add({ itemKind: kind, subject: k.character, reason: 'new' });
            newCount += 1;
          }
        }
      }
    }
  }

  if (mode === 'errors' || mode === 'review') {
    // Sem reforço aleatório: só o que o modo pede (pode ser fila vazia).
    return materialize(candidates.slice(0, size), input, typesWithData, rng, known, wordCandidates);
  }

  // 4) Completa com reforço de itens menos consolidados (caixa mais baixa primeiro).
  const practiced = relevantItems
    .filter((i) => !taken.has(itemKey(i.kind, i.subject)))
    .sort((a, b) => a.box - b.box || a.attempts - b.attempts);
  for (const item of practiced) {
    if (candidates.length >= size) break;
    add({ itemKind: item.kind, subject: item.subject, reason: 'extra' });
  }
  // Poucas lições estudadas: repete o conteúdo já conhecido (combinações
  // kana × habilidade) até completar a rodada — praticar mais antes de avançar.
  const kanaKinds = [...relevantKinds].filter((k) => k === 'kana_read' || k === 'kana_hear');
  const combos = shuffle(
    kana.flatMap((k) => kanaKinds.map((kind) => ({ kind, subject: k.character }))),
    rng
  );
  for (const combo of combos) {
    if (candidates.length >= size) break;
    add({ itemKind: combo.kind, subject: combo.subject, reason: 'extra' });
  }

  return materialize(candidates.slice(0, size), input, typesWithData, rng, known, wordCandidates);
}

function materialize(
  candidates: Candidate[],
  input: BuildPracticeInput,
  types: PracticeQuestionType[],
  rng: () => number,
  known: Set<string>,
  wordCandidates: KnownWord[]
): PracticeQuestion[] {
  const kanaByChar = new Map(input.kana.map((k) => [k.character, k]));
  const questions: PracticeQuestion[] = [];

  candidates.forEach((candidate, index) => {
    const id = `q${index + 1}`;
    if (candidate.itemKind === 'word_fill') {
      const word = wordCandidates.find((w) => w.text === candidate.subject);
      if (word) {
        const q = fillWordQuestion(id, word, input.kana, known, rng, candidate.reason);
        if (q) questions.push(q);
      }
      return;
    }
    const k = kanaByChar.get(candidate.subject);
    if (!k) return;

    const typesForKind = types.filter((t) => kindForType(t) === candidate.itemKind && t !== 'complete_word');
    const type = typesForKind.length > 0 ? typesForKind[Math.floor(rng() * typesForKind.length)] : null;
    if (!type) return;
    questions.push(kanaQuestion(id, type, k, input.kana, rng, candidate.reason));
  });

  // Palavras: se o modo permite e há dados, garante ao menos uma lacuna por rodada mista.
  if (input.mode !== 'errors' && input.mode !== 'review' && types.includes('complete_word') && questions.length > 0) {
    const hasFill = questions.some((q) => q.type === 'complete_word');
    if (!hasFill) {
      const word = shuffle(wordCandidates, rng)[0];
      const q = word ? fillWordQuestion(`q${questions.length + 1}`, word, input.kana, known, rng, 'extra') : null;
      if (q) questions.splice(Math.min(questions.length, 2 + Math.floor(rng() * Math.max(1, questions.length - 2))), 0, q);
    }
  }

  return questions.map((q, i) => ({ ...q, id: `q${i + 1}` }));
}

function kanaQuestion(
  id: string,
  type: PracticeQuestionType,
  k: KnownKana,
  all: KnownKana[],
  rng: () => number,
  reason: PracticeQuestion['reason']
): PracticeQuestion {
  const itemKind = kindForType(type);
  const base = { id, type, itemKind, subject: k.character, reason } as const;

  if (type === 'type_answer') {
    return {
      ...base,
      prompt: 'Digite a leitura em romaji',
      display: k.character,
      speak: k.character,
      acceptedAnswers: acceptedRomajiFor(k.character, k.romaji),
      answerLabel: k.romaji,
    };
  }

  const distractorCount = Math.min(3, Math.max(1, all.length - 1));
  if (type === 'kana_to_sound') {
    const wrong = pickDistractors(all, (x) => x.romaji === k.romaji, distractorCount, rng);
    const choices = shuffle([{ id: 'c', label: k.romaji }, ...wrong.map((w, i) => ({ id: `w${i}`, label: w.romaji }))], rng);
    return { ...base, prompt: 'Qual é o som deste kana?', display: k.character, speak: k.character, choices, correctChoiceId: 'c', answerLabel: k.romaji };
  }

  const wrong = pickDistractors(all, (x) => x.character === k.character, distractorCount, rng);
  const choices = shuffle([{ id: 'c', label: k.character }, ...wrong.map((w, i) => ({ id: `w${i}`, label: w.character }))], rng);
  if (type === 'listen_to_kana') {
    return { ...base, prompt: 'Ouça e escolha o kana', display: '🔊', speak: k.character, choices, correctChoiceId: 'c', answerLabel: `${k.character} (${k.romaji})` };
  }
  return { ...base, prompt: 'Qual kana tem este som?', display: k.romaji, speak: k.character, choices, correctChoiceId: 'c', answerLabel: k.character };
}

function fillWordQuestion(
  id: string,
  word: KnownWord,
  all: KnownKana[],
  known: Set<string>,
  rng: () => number,
  reason: PracticeQuestion['reason']
): PracticeQuestion | null {
  const chars = Array.from(word.text);
  const indexes = blankableIndexes(word.text, known);
  if (indexes.length === 0) return null;
  const blankAt = indexes[Math.floor(rng() * indexes.length)];
  const answer = chars[blankAt];
  const display = chars.map((c, i) => (i === blankAt ? '＿' : c)).join('');
  const singles = all.filter((k) => Array.from(k.character).length === 1 && k.character !== answer);
  const wrong = shuffle(singles, rng).slice(0, 3);
  if (wrong.length === 0) return null;
  const choices = shuffle([{ id: 'c', label: answer }, ...wrong.map((w, i) => ({ id: `w${i}`, label: w.character }))], rng);
  return {
    id,
    type: 'complete_word',
    itemKind: 'word_fill',
    subject: word.text,
    prompt: 'Complete a palavra',
    display,
    speak: word.text,
    choices,
    correctChoiceId: 'c',
    answerLabel: word.text,
    translation: word.translation,
    reason,
  };
}

/** Verifica uma resposta digitada contra as aceitas. */
export { isRomajiAnswerCorrect } from './romaji';

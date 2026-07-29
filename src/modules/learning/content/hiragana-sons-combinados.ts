import { LessonContentSchema, type LessonContent } from '../domain/lesson-content.schema';

/**
 * Conteúdo da lição "Hiragana — Sons combinados" (módulo Fundamentos,
 * curso Japonês). Ensina o princípio do yōon com きゃ/しゃ/ちゃ; outros
 * grupos (にゃ, ひゃ, みゃ, りゃ, ぎゃ, じゃ, びゃ, ぴゃ...) são citados só
 * como extensão do mesmo padrão, sem exigir memorização completa.
 */
const content: LessonContent = LessonContentSchema.parse({
  blocks: [
    {
      id: 'objective',
      type: 'objective',
      text: 'Entender o princípio dos sons combinados (yōon) com きゃ/きゅ/きょ, しゃ/しゅ/しょ e ちゃ/ちゅ/ちょ.',
    },
    {
      id: 'texto-sons-combinados',
      type: 'text',
      heading: 'Sons combinados',
      paragraphs: [
        'Um kana da coluna "i" (き, し, ち, entre outros) seguido de や, ゆ ou よ em tamanho pequeno forma um único som combinado — não duas sílabas separadas.',
        'O mesmo padrão se repete com outros kana da coluna "i": に, ひ, み, り, ぎ, じ, び, ぴ formam famílias equivalentes (にゃ/にゅ/にょ e assim por diante). Você não precisa memorizar todas agora — o princípio é sempre o mesmo.',
      ],
    },
    {
      id: 'kana-kya',
      type: 'kana',
      heading: 'きゃ / きゅ / きょ',
      characters: [
        { character: 'きゃ', romaji: 'kya' },
        { character: 'きゅ', romaji: 'kyu' },
        { character: 'きょ', romaji: 'kyo' },
      ],
    },
    {
      id: 'kana-sha',
      type: 'kana',
      heading: 'しゃ / しゅ / しょ',
      characters: [
        { character: 'しゃ', romaji: 'sha' },
        { character: 'しゅ', romaji: 'shu' },
        { character: 'しょ', romaji: 'sho' },
      ],
    },
    {
      id: 'kana-cha',
      type: 'kana',
      heading: 'ちゃ / ちゅ / ちょ',
      characters: [
        { character: 'ちゃ', romaji: 'cha' },
        { character: 'ちゅ', romaji: 'chu' },
        { character: 'ちょ', romaji: 'cho' },
      ],
    },
    {
      id: 'nota-tamanho',
      type: 'note',
      tone: 'warning',
      text: 'や、ゆ e よ em tamanho normal são sílabas próprias (linha Y). Pequenos — ゃ、ゅ、ょ — nunca aparecem sozinhos: sempre colados a um kana como き ou し, formando um som só.',
    },
    {
      id: 'exemplos',
      type: 'example',
      heading: 'Em contexto',
      items: [
        { text: 'おちゃ', romaji: 'ocha', translation: 'chá' },
        { text: 'いしゃ', romaji: 'isha', translation: 'médico(a)' },
      ],
    },
    {
      id: 'quiz-sons-combinados',
      type: 'multiple_choice',
      prompt: 'Como se lê きょ?',
      options: [
        { id: 'kyo', text: 'kyo' },
        { id: 'kiyo', text: 'ki + yo (duas sílabas)' },
        { id: 'kyou', text: 'kyou' },
      ],
      correctOptionId: 'kyo',
      explanation: 'きょ é um som combinado só: "kyo", não "ki" + "yo" separados.',
    },
    {
      id: 'matching-sons-combinados',
      type: 'matching',
      prompt: 'Associe cada som combinado à leitura correspondente.',
      pairs: [
        { id: 'kya', left: 'きゃ', right: 'kya' },
        { id: 'shu', left: 'しゅ', right: 'shu' },
        { id: 'cho', left: 'ちょ', right: 'cho' },
        { id: 'kyu', left: 'きゅ', right: 'kyu' },
        { id: 'sho', left: 'しょ', right: 'sho' },
      ],
    },
    {
      id: 'resumo',
      type: 'summary',
      points: [
        'Um kana da coluna "i" + ゃ/ゅ/ょ pequeno forma um som combinado só.',
        'きゃ・きゅ・きょ, しゃ・しゅ・しょ e ちゃ・ちゅ・ちょ seguem esse padrão.',
        'ゃ、ゅ、ょ pequenos nunca aparecem sozinhos — são diferentes de や、ゆ、よ em tamanho normal.',
      ],
    },
  ],
});

export default content;

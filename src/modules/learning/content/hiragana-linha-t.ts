import { LessonContentSchema, type LessonContent } from '../domain/lesson-content.schema';

/**
 * Conteúdo da lição "Hiragana — Linha T" (módulo Fundamentos, curso
 * Japonês). Introduz duas exceções de leitura na mesma linha: ち (chi) e
 * つ (tsu).
 */
const content: LessonContent = LessonContentSchema.parse({
  blocks: [
    {
      id: 'objective',
      type: 'objective',
      text: 'Reconhecer e ler os cinco sons da linha T do hiragana: た, ち, つ, て, と, incluindo as exceções ち (chi) e つ (tsu).',
    },
    {
      id: 'texto-linha-t',
      type: 'text',
      heading: 'A linha T',
      paragraphs: [
        'A linha T combina o som "t" com cada vogal — た, て, と seguem o padrão regular: ta, te, to.',
        'Duas exceções: ち se lê "chi" e つ se lê "tsu".',
      ],
    },
    {
      id: 'kana-linha-t',
      type: 'kana',
      heading: 'A linha T',
      characters: [
        { character: 'た', romaji: 'ta' },
        { character: 'ち', romaji: 'chi' },
        { character: 'つ', romaji: 'tsu' },
        { character: 'て', romaji: 'te' },
        { character: 'と', romaji: 'to' },
      ],
    },
    {
      id: 'exemplos',
      type: 'example',
      heading: 'Em contexto',
      items: [
        { text: 'いち', romaji: 'ichi', translation: 'um (número 1)' },
        { text: 'した', romaji: 'shita', translation: 'embaixo' },
      ],
    },
    {
      id: 'nota-chi-tsu',
      type: 'note',
      tone: 'info',
      text: 'ち e つ são as exceções desta linha: "chi" e "tsu", não "ti" e "tu".',
    },
    {
      id: 'quiz-linha-t',
      type: 'multiple_choice',
      prompt: 'Como se lê つ?',
      options: [
        { id: 'tsu', text: 'tsu' },
        { id: 'tu', text: 'tu' },
        { id: 'chi', text: 'chi' },
      ],
      correctOptionId: 'tsu',
      explanation: 'つ é lido "tsu" — outra exceção de leitura da linha T.',
    },
    {
      id: 'matching-linha-t',
      type: 'matching',
      prompt: 'Associe cada caractere ao som correspondente.',
      pairs: [
        { id: 'ta', left: 'た', right: 'ta' },
        { id: 'chi', left: 'ち', right: 'chi' },
        { id: 'tsu', left: 'つ', right: 'tsu' },
        { id: 'te', left: 'て', right: 'te' },
        { id: 'to', left: 'と', right: 'to' },
      ],
    },
    {
      id: 'resumo',
      type: 'summary',
      points: [
        'た、て、と seguem o padrão regular: ta, te, to.',
        'ち = chi e つ = tsu são as exceções desta linha.',
      ],
    },
  ],
});

export default content;

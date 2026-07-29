import { LessonContentSchema, type LessonContent } from '../domain/lesson-content.schema';

/**
 * Conteúdo da lição "Hiragana — Linha S" (módulo Fundamentos, curso
 * Japonês). Quarta lição do percurso de Hiragana — introduz a primeira
 * exceção de leitura da linha S (し = "shi").
 */
const content: LessonContent = LessonContentSchema.parse({
  blocks: [
    {
      id: 'objective',
      type: 'objective',
      text: 'Reconhecer e ler os cinco sons da linha S do hiragana: さ, し, す, せ, そ, incluindo a exceção し (shi).',
    },
    {
      id: 'texto-linha-s',
      type: 'text',
      heading: 'A linha S',
      paragraphs: [
        'A linha S combina o som "s" com cada vogal — さ, す, せ, そ seguem o padrão regular: sa, su, se, so.',
        'A exceção é し, que se lê "shi", não "si".',
      ],
    },
    {
      id: 'kana-linha-s',
      type: 'kana',
      heading: 'A linha S',
      characters: [
        { character: 'さ', romaji: 'sa' },
        { character: 'し', romaji: 'shi' },
        { character: 'す', romaji: 'su' },
        { character: 'せ', romaji: 'se' },
        { character: 'そ', romaji: 'so' },
      ],
    },
    {
      id: 'exemplos',
      type: 'example',
      heading: 'Em contexto',
      items: [
        { text: 'あし', romaji: 'ashi', translation: 'perna / pé' },
        { text: 'かさ', romaji: 'kasa', translation: 'guarda-chuva' },
      ],
    },
    {
      id: 'nota-shi',
      type: 'note',
      tone: 'info',
      text: 'し é a única irregularidade desta linha: lê-se "shi". As demais sílabas seguem o padrão regular.',
    },
    {
      id: 'quiz-linha-s',
      type: 'multiple_choice',
      prompt: 'Como se lê し?',
      options: [
        { id: 'shi', text: 'shi' },
        { id: 'si', text: 'si' },
        { id: 'chi', text: 'chi' },
      ],
      correctOptionId: 'shi',
      explanation: 'し é uma exceção de leitura: "shi", não "si".',
    },
    {
      id: 'matching-linha-s',
      type: 'matching',
      prompt: 'Associe cada caractere ao som correspondente.',
      pairs: [
        { id: 'sa', left: 'さ', right: 'sa' },
        { id: 'shi', left: 'し', right: 'shi' },
        { id: 'su', left: 'す', right: 'su' },
        { id: 'se', left: 'せ', right: 'se' },
      ],
    },
    {
      id: 'resumo',
      type: 'summary',
      points: [
        'さ、す、せ、そ seguem o padrão regular: sa, su, se, so.',
        'し é a exceção desta linha: lê-se "shi".',
      ],
    },
  ],
});

export default content;

import { LessonContentSchema, type LessonContent } from '../domain/lesson-content.schema';

/**
 * Conteúdo da lição "Hiragana — Vogais" (módulo Fundamentos, curso
 * Japonês). Segunda lição de exemplo usada para validar a infraestrutura do
 * Learning Content Engine — em especial os blocos `kana` e `matching`, que
 * a lição de introdução não exercita.
 */
const content: LessonContent = LessonContentSchema.parse({
  blocks: [
    {
      id: 'objective',
      type: 'objective',
      text: 'Reconhecer e pronunciar as cinco vogais do hiragana: あ, い, う, え, お.',
    },
    {
      id: 'texto-intro',
      type: 'text',
      heading: 'As vogais do hiragana',
      paragraphs: [
        'O hiragana é um dos sistemas de escrita do japonês, usado para palavras nativas e terminações gramaticais.',
        'Todas as demais sílabas do hiragana são combinações de consoante + vogal construídas a partir destes cinco sons.',
      ],
    },
    {
      id: 'kana-vogais',
      type: 'kana',
      heading: 'As cinco vogais',
      characters: [
        { character: 'あ', romaji: 'a' },
        { character: 'い', romaji: 'i' },
        { character: 'う', romaji: 'u' },
        { character: 'え', romaji: 'e' },
        { character: 'お', romaji: 'o' },
      ],
    },
    {
      id: 'exemplos',
      type: 'example',
      heading: 'Em contexto',
      items: [
        { text: 'あい', romaji: 'ai', translation: 'amor', note: 'a + i' },
        { text: 'うえ', romaji: 'ue', translation: 'em cima', note: 'u + e' },
      ],
    },
    {
      id: 'nota-traco',
      type: 'note',
      tone: 'tip',
      text: 'Pratique traçando cada caractere na ordem correta — isso ajuda a memorizar o formato.',
    },
    {
      id: 'quiz-som-u',
      type: 'multiple_choice',
      prompt: 'Qual caractere representa o som "u"?',
      options: [
        { id: 'u', text: 'う' },
        { id: 'e', text: 'え' },
        { id: 'o', text: 'お' },
      ],
      correctOptionId: 'u',
      explanation: 'う é a terceira vogal do hiragana, com som "u".',
    },
    {
      id: 'matching-vogais',
      type: 'matching',
      prompt: 'Associe cada caractere ao som correspondente.',
      pairs: [
        { id: 'a', left: 'あ', right: 'a' },
        { id: 'i', left: 'い', right: 'i' },
        { id: 'u', left: 'う', right: 'u' },
        { id: 'e', left: 'え', right: 'e' },
        { id: 'o', left: 'お', right: 'o' },
      ],
    },
    {
      id: 'resumo',
      type: 'summary',
      points: [
        'あ、い、う、え、お são as cinco vogais do hiragana.',
        'Todas as demais sílabas do hiragana combinam essas vogais com consoantes.',
        'A leitura correta (romaji) é a, i, u, e, o.',
      ],
    },
  ],
});

export default content;

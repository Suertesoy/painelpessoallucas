import { LessonContentSchema, type LessonContent } from '../domain/lesson-content.schema';

/**
 * Conteúdo da lição "Hiragana — Linha Y" (módulo Fundamentos, curso
 * Japonês). Linha com apenas três símbolos no japonês moderno.
 */
const content: LessonContent = LessonContentSchema.parse({
  blocks: [
    {
      id: 'objective',
      type: 'objective',
      text: 'Reconhecer e ler os três sons da linha Y do hiragana: や, ゆ, よ.',
    },
    {
      id: 'texto-linha-y',
      type: 'text',
      heading: 'A linha Y',
      paragraphs: [
        'A linha Y combina o som "y" com as vogais a, u e o: や, ゆ, よ (ya, yu, yo).',
        'No japonês moderno, esta linha tem apenas três símbolos — não existem "yi" nem "ye" como sílabas independentes.',
      ],
    },
    {
      id: 'kana-linha-y',
      type: 'kana',
      heading: 'A linha Y',
      characters: [
        { character: 'や', romaji: 'ya' },
        { character: 'ゆ', romaji: 'yu' },
        { character: 'よ', romaji: 'yo' },
      ],
    },
    {
      id: 'exemplos',
      type: 'example',
      heading: 'Em contexto',
      items: [
        { text: 'やま', romaji: 'yama', translation: 'montanha' },
        { text: 'ゆき', romaji: 'yuki', translation: 'neve' },
      ],
    },
    {
      id: 'quiz-linha-y',
      type: 'multiple_choice',
      prompt: 'Qual caractere tem som "yu"?',
      options: [
        { id: 'yu', text: 'ゆ' },
        { id: 'ya', text: 'や' },
        { id: 'yo', text: 'よ' },
      ],
      correctOptionId: 'yu',
    },
    {
      id: 'matching-linha-y',
      type: 'matching',
      prompt: 'Associe cada caractere ao som correspondente.',
      pairs: [
        { id: 'ya', left: 'や', right: 'ya' },
        { id: 'yu', left: 'ゆ', right: 'yu' },
        { id: 'yo', left: 'よ', right: 'yo' },
      ],
    },
    {
      id: 'resumo',
      type: 'summary',
      points: [
        'や、ゆ、よ são os sons y + vogal: ya, yu, yo.',
        'Diferente das outras linhas, esta tem apenas três símbolos no japonês moderno.',
      ],
    },
  ],
});

export default content;

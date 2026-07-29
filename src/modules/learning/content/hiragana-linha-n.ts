import { LessonContentSchema, type LessonContent } from '../domain/lesson-content.schema';

/**
 * Conteúdo da lição "Hiragana — Linha N" (módulo Fundamentos, curso
 * Japonês). Linha totalmente regular, sem exceções de leitura.
 */
const content: LessonContent = LessonContentSchema.parse({
  blocks: [
    {
      id: 'objective',
      type: 'objective',
      text: 'Reconhecer e ler os cinco sons da linha N do hiragana: な, に, ぬ, ね, の.',
    },
    {
      id: 'texto-linha-n',
      type: 'text',
      heading: 'A linha N',
      paragraphs: [
        'A linha N combina o som "n" com cada vogal: な, に, ぬ, ね, の — todas seguem o padrão regular: na, ni, nu, ne, no.',
      ],
    },
    {
      id: 'kana-linha-n',
      type: 'kana',
      heading: 'A linha N',
      characters: [
        { character: 'な', romaji: 'na' },
        { character: 'に', romaji: 'ni' },
        { character: 'ぬ', romaji: 'nu' },
        { character: 'ね', romaji: 'ne' },
        { character: 'の', romaji: 'no' },
      ],
    },
    {
      id: 'exemplos',
      type: 'example',
      heading: 'Em contexto',
      items: [
        { text: 'ねこ', romaji: 'neko', translation: 'gato' },
        { text: 'あに', romaji: 'ani', translation: 'irmão mais velho' },
      ],
    },
    {
      id: 'quiz-linha-n',
      type: 'multiple_choice',
      prompt: 'Qual caractere tem som "ne"?',
      options: [
        { id: 'ne', text: 'ね' },
        { id: 'na', text: 'な' },
        { id: 'no', text: 'の' },
      ],
      correctOptionId: 'ne',
    },
    {
      id: 'matching-linha-n',
      type: 'matching',
      prompt: 'Associe cada caractere ao som correspondente.',
      pairs: [
        { id: 'na', left: 'な', right: 'na' },
        { id: 'ni', left: 'に', right: 'ni' },
        { id: 'nu', left: 'ぬ', right: 'nu' },
        { id: 'ne', left: 'ね', right: 'ne' },
        { id: 'no', left: 'の', right: 'no' },
      ],
    },
    {
      id: 'resumo',
      type: 'summary',
      points: [
        'な、に、ぬ、ね、の são os sons n + vogal: na, ni, nu, ne, no.',
        'Todas seguem o padrão regular, sem exceções de leitura.',
      ],
    },
  ],
});

export default content;

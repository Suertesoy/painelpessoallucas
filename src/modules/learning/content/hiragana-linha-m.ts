import { LessonContentSchema, type LessonContent } from '../domain/lesson-content.schema';

/**
 * Conteúdo da lição "Hiragana — Linha M" (módulo Fundamentos, curso
 * Japonês). Linha totalmente regular, sem exceções de leitura.
 */
const content: LessonContent = LessonContentSchema.parse({
  blocks: [
    {
      id: 'objective',
      type: 'objective',
      text: 'Reconhecer e ler os cinco sons da linha M do hiragana: ま, み, む, め, も.',
    },
    {
      id: 'texto-linha-m',
      type: 'text',
      heading: 'A linha M',
      paragraphs: [
        'A linha M combina o som "m" com cada vogal: ま, み, む, め, も — todas seguem o padrão regular: ma, mi, mu, me, mo.',
      ],
    },
    {
      id: 'kana-linha-m',
      type: 'kana',
      heading: 'A linha M',
      characters: [
        { character: 'ま', romaji: 'ma' },
        { character: 'み', romaji: 'mi' },
        { character: 'む', romaji: 'mu' },
        { character: 'め', romaji: 'me' },
        { character: 'も', romaji: 'mo' },
      ],
    },
    {
      id: 'exemplos',
      type: 'example',
      heading: 'Em contexto',
      items: [
        { text: 'あめ', romaji: 'ame', translation: 'chuva' },
        { text: 'みみ', romaji: 'mimi', translation: 'orelha' },
      ],
    },
    {
      id: 'quiz-linha-m',
      type: 'multiple_choice',
      prompt: 'Qual caractere tem som "mo"?',
      options: [
        { id: 'mo', text: 'も' },
        { id: 'me', text: 'め' },
        { id: 'mu', text: 'む' },
      ],
      correctOptionId: 'mo',
    },
    {
      id: 'matching-linha-m',
      type: 'matching',
      prompt: 'Associe cada caractere ao som correspondente.',
      pairs: [
        { id: 'ma', left: 'ま', right: 'ma' },
        { id: 'mi', left: 'み', right: 'mi' },
        { id: 'mu', left: 'む', right: 'mu' },
        { id: 'me', left: 'め', right: 'me' },
        { id: 'mo', left: 'も', right: 'mo' },
      ],
    },
    {
      id: 'resumo',
      type: 'summary',
      points: [
        'ま、み、む、め、も são os sons m + vogal: ma, mi, mu, me, mo.',
        'Todas seguem o padrão regular, sem exceções de leitura.',
      ],
    },
  ],
});

export default content;

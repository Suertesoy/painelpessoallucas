import { LessonContentSchema, type LessonContent } from '../domain/lesson-content.schema';

/**
 * Conteúdo da lição "Hiragana — Linha K" (módulo Fundamentos, curso
 * Japonês). Terceira lição do percurso de Hiragana — combina o som "k" com
 * as cinco vogais já ensinadas em `hiragana-vogais`.
 */
const content: LessonContent = LessonContentSchema.parse({
  blocks: [
    {
      id: 'objective',
      type: 'objective',
      text: 'Reconhecer e ler os cinco sons da linha K do hiragana: か, き, く, け, こ.',
    },
    {
      id: 'texto-linha-k',
      type: 'text',
      heading: 'A linha K',
      paragraphs: [
        'Assim como as vogais, os demais sons do hiragana combinam uma consoante com uma vogal. A linha K junta o som "k" com cada uma das cinco vogais: か, き, く, け, こ.',
        'A leitura é direta: ka, ki, ku, ke, ko — sem exceções de pronúncia nesta linha.',
      ],
    },
    {
      id: 'kana-linha-k',
      type: 'kana',
      heading: 'A linha K',
      characters: [
        { character: 'か', romaji: 'ka' },
        { character: 'き', romaji: 'ki' },
        { character: 'く', romaji: 'ku' },
        { character: 'け', romaji: 'ke' },
        { character: 'こ', romaji: 'ko' },
      ],
    },
    {
      id: 'exemplos',
      type: 'example',
      heading: 'Em contexto',
      items: [
        { text: 'あか', romaji: 'aka', translation: 'vermelho' },
        { text: 'いけ', romaji: 'ike', translation: 'lagoa' },
      ],
    },
    {
      id: 'quiz-linha-k',
      type: 'multiple_choice',
      prompt: 'Qual caractere representa o som "ko"?',
      options: [
        { id: 'ko', text: 'こ' },
        { id: 'ke', text: 'け' },
        { id: 'ku', text: 'く' },
      ],
      correctOptionId: 'ko',
      explanation: 'こ é a última sílaba da linha K, com som "ko".',
    },
    {
      id: 'matching-linha-k',
      type: 'matching',
      prompt: 'Associe cada caractere ao som correspondente.',
      pairs: [
        { id: 'ka', left: 'か', right: 'ka' },
        { id: 'ki', left: 'き', right: 'ki' },
        { id: 'ku', left: 'く', right: 'ku' },
        { id: 'ke', left: 'け', right: 'ke' },
      ],
    },
    {
      id: 'resumo',
      type: 'summary',
      points: [
        'か、き、く、け、こ são os sons k + vogal: ka, ki, ku, ke, ko.',
        'A leitura desta linha não tem exceções — todas seguem o padrão regular.',
      ],
    },
  ],
});

export default content;

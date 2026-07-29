import { LessonContentSchema, type LessonContent } from '../domain/lesson-content.schema';

/**
 * Conteúdo da lição "Hiragana — Revisão: T, N e H" (módulo Fundamentos,
 * curso Japonês). Segunda revisão cumulativa — mistura o conjunto recente
 * (T, N, H) com o conteúdo anterior, sem símbolos novos.
 */
const content: LessonContent = LessonContentSchema.parse({
  blocks: [
    {
      id: 'objective',
      type: 'objective',
      text: 'Revisar e misturar a leitura das linhas T, N e H com o conteúdo anterior do hiragana.',
    },
    {
      id: 'texto-revisao-2',
      type: 'text',
      heading: 'Revisão',
      paragraphs: ['Nenhum símbolo novo nesta lição — só prática misturando T, N, H e o conteúdo anterior.'],
    },
    {
      id: 'exemplos',
      type: 'example',
      heading: 'Em contexto',
      items: [
        { text: 'たのしい', romaji: 'tanoshii', translation: 'divertido' },
        { text: 'ひと', romaji: 'hito', translation: 'pessoa' },
      ],
    },
    {
      id: 'quiz-revisao-2a',
      type: 'multiple_choice',
      prompt: 'Qual caractere tem som "na"?',
      options: [
        { id: 'na', text: 'な' },
        { id: 'ta', text: 'た' },
        { id: 'ha', text: 'は' },
      ],
      correctOptionId: 'na',
    },
    {
      id: 'quiz-revisao-2b',
      type: 'multiple_choice',
      prompt: 'Qual caractere tem som "ho"?',
      options: [
        { id: 'ho', text: 'ほ' },
        { id: 'no', text: 'の' },
        { id: 'so', text: 'そ' },
      ],
      correctOptionId: 'ho',
    },
    {
      id: 'matching-revisao-2',
      type: 'matching',
      prompt: 'Associe cada caractere ao som correspondente.',
      pairs: [
        { id: 'ta', left: 'た', right: 'ta' },
        { id: 'ni', left: 'に', right: 'ni' },
        { id: 'fu', left: 'ふ', right: 'fu' },
        { id: 'su', left: 'す', right: 'su' },
        { id: 'ka', left: 'か', right: 'ka' },
      ],
    },
    {
      id: 'resumo',
      type: 'summary',
      points: [
        'Linha T: た・ち・つ・て・と.',
        'Linha N: な・に・ぬ・ね・の.',
        'Linha H: は・ひ・ふ・へ・ほ.',
      ],
    },
  ],
});

export default content;

import { LessonContentSchema, type LessonContent } from '../domain/lesson-content.schema';

/**
 * Conteúdo da lição "Hiragana — Revisão: Vogais, K e S" (módulo
 * Fundamentos, curso Japonês). Primeira revisão cumulativa do percurso —
 * não introduz nenhum símbolo novo, só mistura o que já foi ensinado.
 */
const content: LessonContent = LessonContentSchema.parse({
  blocks: [
    {
      id: 'objective',
      type: 'objective',
      text: 'Revisar e misturar a leitura das vogais e das linhas K e S do hiragana.',
    },
    {
      id: 'texto-revisao-1',
      type: 'text',
      heading: 'Revisão',
      paragraphs: [
        'Até aqui você já reconhece as vogais e as linhas K e S do hiragana. Esta lição não traz símbolos novos — é só prática de leitura misturada.',
      ],
    },
    {
      id: 'exemplos',
      type: 'example',
      heading: 'Em contexto',
      items: [
        { text: 'すし', romaji: 'sushi', translation: 'sushi' },
        { text: 'あさ', romaji: 'asa', translation: 'manhã' },
      ],
    },
    {
      id: 'quiz-revisao-1a',
      type: 'multiple_choice',
      prompt: 'Qual destes é a vogal "e"?',
      options: [
        { id: 'e', text: 'え' },
        { id: 'ke', text: 'け' },
        { id: 'se', text: 'せ' },
      ],
      correctOptionId: 'e',
      explanation: 'え é a vogal "e"; け e せ são sílabas das linhas K e S com a mesma vogal.',
    },
    {
      id: 'quiz-revisao-1b',
      type: 'multiple_choice',
      prompt: 'Qual caractere tem som "shi"?',
      options: [
        { id: 'shi', text: 'し' },
        { id: 'sa', text: 'さ' },
        { id: 'su', text: 'す' },
      ],
      correctOptionId: 'shi',
    },
    {
      id: 'matching-revisao-1',
      type: 'matching',
      prompt: 'Associe cada caractere ao som correspondente.',
      pairs: [
        { id: 'a', left: 'あ', right: 'a' },
        { id: 'ka', left: 'か', right: 'ka' },
        { id: 'sa', left: 'さ', right: 'sa' },
        { id: 'shi', left: 'し', right: 'shi' },
      ],
    },
    {
      id: 'resumo',
      type: 'summary',
      points: [
        'Vogais: あ・い・う・え・お.',
        'Linha K: か・き・く・け・こ.',
        'Linha S: さ・し・す・せ・そ (com a exceção し = shi).',
      ],
    },
  ],
});

export default content;

import { LessonContentSchema, type LessonContent } from '../domain/lesson-content.schema';

/**
 * Conteúdo da lição "Hiragana — Revisão final" (módulo Fundamentos, curso
 * Japonês). Fecha o percurso de Hiragana — revisão cumulativa distribuída
 * em blocos curtos, sem símbolos novos. Deixa explícito que concluir o
 * módulo é uma base inicial de leitura, não domínio total.
 */
const content: LessonContent = LessonContentSchema.parse({
  blocks: [
    {
      id: 'objective',
      type: 'objective',
      text: 'Revisar de forma cumulativa todo o hiragana básico estudado: kana básico, dakuten, handakuten, sons combinados, っ pequeno e vogais longas.',
    },
    {
      id: 'texto-revisao-final',
      type: 'text',
      heading: 'Revisão final do módulo',
      paragraphs: [
        'Esta lição não traz símbolos novos. É uma revisão cumulativa, dividida em blocos curtos, cobrindo tudo que você estudou desde as vogais até a leitura de palavras.',
      ],
    },
    {
      id: 'exemplos',
      type: 'example',
      heading: 'Em contexto',
      items: [
        { text: 'おはよう', romaji: 'ohayou', translation: 'bom dia' },
        { text: 'ともだち', romaji: 'tomodachi', translation: 'amigo(a)' },
      ],
    },
    {
      id: 'matching-final-basico',
      type: 'matching',
      prompt: 'Associe cada caractere ao som correspondente — kana básico.',
      pairs: [
        { id: 'a', left: 'あ', right: 'a' },
        { id: 'ka', left: 'か', right: 'ka' },
        { id: 'sa', left: 'さ', right: 'sa' },
        { id: 'ta', left: 'た', right: 'ta' },
        { id: 'na', left: 'な', right: 'na' },
      ],
    },
    {
      id: 'matching-final-dakuten',
      type: 'matching',
      prompt: 'Associe cada caractere ao som correspondente — dakuten e handakuten.',
      pairs: [
        { id: 'ga', left: 'が', right: 'ga' },
        { id: 'za', left: 'ざ', right: 'za' },
        { id: 'da', left: 'だ', right: 'da' },
        { id: 'ba', left: 'ば', right: 'ba' },
        { id: 'pa', left: 'ぱ', right: 'pa' },
      ],
    },
    {
      id: 'quiz-final-combinado',
      type: 'multiple_choice',
      prompt: 'Qual destes é um som combinado (yōon)?',
      options: [
        { id: 'sho', text: 'しょ' },
        { id: 'shi', text: 'し' },
        { id: 'yo', text: 'よ' },
      ],
      correctOptionId: 'sho',
      explanation: 'しょ combina し com ょ pequeno, formando um som só.',
    },
    {
      id: 'quiz-final-tsu',
      type: 'multiple_choice',
      prompt: 'O que っ pequeno indica?',
      options: [
        { id: 'pausa', text: 'Uma pausa antes da consoante seguinte' },
        { id: 'vogal-u', text: 'A vogal "u"' },
        { id: 'igual-tsu', text: 'O mesmo som que つ grande' },
      ],
      correctOptionId: 'pausa',
    },
    {
      id: 'resumo',
      type: 'summary',
      points: [
        'Você concluiu os 46 símbolos básicos, dakuten, handakuten, sons combinados, っ pequeno e vogais longas.',
        'Isso é uma base inicial de leitura — não domínio total nem instantâneo.',
        'A prática contínua com palavras reais é o que vai consolidar o reconhecimento.',
      ],
    },
  ],
});

export default content;

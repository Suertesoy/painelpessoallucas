import { LessonContentSchema, type LessonContent } from '../domain/lesson-content.schema';

/**
 * Conteúdo da lição "Hiragana — Linha W e ん" (módulo Fundamentos, curso
 * Japonês). Fecha o conjunto básico de 46 símbolos com わ, を e ん.
 */
const content: LessonContent = LessonContentSchema.parse({
  blocks: [
    {
      id: 'objective',
      type: 'objective',
      text: 'Reconhecer わ, を e ん — os últimos símbolos do hiragana básico.',
    },
    {
      id: 'texto-linha-w-n',
      type: 'text',
      heading: 'W e o som nasal ん',
      paragraphs: [
        'わ é uma sílaba comum, lida "wa".',
        'を e ん são especiais: を aparece quase só como partícula gramatical, e ん é um som nasal que não se combina com uma vogal.',
      ],
    },
    {
      id: 'kana-linha-w-n',
      type: 'kana',
      heading: 'W e ん',
      characters: [
        { character: 'わ', romaji: 'wa' },
        { character: 'を', romaji: 'o' },
        { character: 'ん', romaji: 'n' },
      ],
    },
    {
      id: 'nota-wo',
      type: 'note',
      tone: 'info',
      text: 'を aparece principalmente como partícula gramatical e é normalmente pronunciado como "o" — o mesmo som de お. Seu uso em frases será estudado na fase de gramática.',
    },
    {
      id: 'nota-n',
      type: 'note',
      tone: 'info',
      text: 'ん representa um som nasal e pode aparecer no meio ou no final de uma palavra — nunca no início. Diferente das outras sílabas, não se combina com uma vogal.',
    },
    {
      id: 'exemplos',
      type: 'example',
      heading: 'Em contexto',
      items: [
        { text: 'わたし', romaji: 'watashi', translation: 'eu' },
        { text: 'ほん', romaji: 'hon', translation: 'livro' },
      ],
    },
    {
      id: 'quiz-wo',
      type: 'multiple_choice',
      prompt: 'Como を costuma ser pronunciado?',
      options: [
        { id: 'o', text: 'o' },
        { id: 'wo', text: 'wo' },
        { id: 'u', text: 'u' },
      ],
      correctOptionId: 'o',
      explanation: 'を é normalmente pronunciado "o", embora historicamente escrito como "wo".',
    },
    {
      id: 'matching-linha-w-n',
      type: 'matching',
      prompt: 'Associe cada caractere ao som correspondente.',
      pairs: [
        { id: 'wa', left: 'わ', right: 'wa' },
        { id: 'o', left: 'を', right: 'o' },
        { id: 'n', left: 'ん', right: 'n' },
      ],
    },
    {
      id: 'resumo',
      type: 'summary',
      points: [
        'わ é lido "wa".',
        'を aparece principalmente como partícula e é pronunciado "o".',
        'ん é um som nasal, sem vogal — nunca aparece no início de uma palavra.',
      ],
    },
  ],
});

export default content;

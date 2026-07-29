import { LessonContentSchema, type LessonContent } from '../domain/lesson-content.schema';

/**
 * Conteúdo da lição "Hiragana — Linha H" (módulo Fundamentos, curso
 * Japonês). Introduz a exceção ふ (fu). Não aborda o uso de は/へ como
 * partículas gramaticais — fora do escopo desta fase.
 */
const content: LessonContent = LessonContentSchema.parse({
  blocks: [
    {
      id: 'objective',
      type: 'objective',
      text: 'Reconhecer e ler os cinco sons da linha H do hiragana: は, ひ, ふ, へ, ほ, incluindo a exceção ふ (fu).',
    },
    {
      id: 'texto-linha-h',
      type: 'text',
      heading: 'A linha H',
      paragraphs: [
        'A linha H combina o som "h" com cada vogal — は, ひ, へ, ほ seguem o padrão regular: ha, hi, he, ho.',
        'A exceção é ふ, romanizado como "fu".',
      ],
    },
    {
      id: 'kana-linha-h',
      type: 'kana',
      heading: 'A linha H',
      characters: [
        { character: 'は', romaji: 'ha' },
        { character: 'ひ', romaji: 'hi' },
        { character: 'ふ', romaji: 'fu' },
        { character: 'へ', romaji: 'he' },
        { character: 'ほ', romaji: 'ho' },
      ],
    },
    {
      id: 'exemplos',
      type: 'example',
      heading: 'Em contexto',
      items: [
        { text: 'はな', romaji: 'hana', translation: 'flor' },
        { text: 'ほし', romaji: 'hoshi', translation: 'estrela' },
      ],
    },
    {
      id: 'nota-fu',
      type: 'note',
      tone: 'info',
      text: 'ふ é a exceção desta linha: lê-se "fu", um som entre o "f" e o "h" do português.',
    },
    {
      id: 'quiz-linha-h',
      type: 'multiple_choice',
      prompt: 'Como se lê ふ?',
      options: [
        { id: 'fu', text: 'fu' },
        { id: 'hu', text: 'hu' },
        { id: 'fo', text: 'fo' },
      ],
      correctOptionId: 'fu',
    },
    {
      id: 'matching-linha-h',
      type: 'matching',
      prompt: 'Associe cada caractere ao som correspondente.',
      pairs: [
        { id: 'ha', left: 'は', right: 'ha' },
        { id: 'hi', left: 'ひ', right: 'hi' },
        { id: 'fu', left: 'ふ', right: 'fu' },
        { id: 'he', left: 'へ', right: 'he' },
        { id: 'ho', left: 'ほ', right: 'ho' },
      ],
    },
    {
      id: 'resumo',
      type: 'summary',
      points: [
        'は、ひ、へ、ほ seguem o padrão regular: ha, hi, he, ho.',
        'ふ é a exceção desta linha: lê-se "fu".',
      ],
    },
  ],
});

export default content;

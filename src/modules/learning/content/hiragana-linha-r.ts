import { LessonContentSchema, type LessonContent } from '../domain/lesson-content.schema';

/**
 * Conteúdo da lição "Hiragana — Linha R" (módulo Fundamentos, curso
 * Japonês). Evita comparação rígida com "R"/"L" do português — a
 * pronúncia fica para uma fase futura com áudio.
 */
const content: LessonContent = LessonContentSchema.parse({
  blocks: [
    {
      id: 'objective',
      type: 'objective',
      text: 'Reconhecer e ler os cinco sons da linha R do hiragana: ら, り, る, れ, ろ.',
    },
    {
      id: 'texto-linha-r',
      type: 'text',
      heading: 'A linha R',
      paragraphs: [
        'A linha R combina o som "r" com cada vogal: ら, り, る, れ, ろ (ra, ri, ru, re, ro).',
      ],
    },
    {
      id: 'kana-linha-r',
      type: 'kana',
      heading: 'A linha R',
      characters: [
        { character: 'ら', romaji: 'ra' },
        { character: 'り', romaji: 'ri' },
        { character: 'る', romaji: 'ru' },
        { character: 'れ', romaji: 're' },
        { character: 'ろ', romaji: 'ro' },
      ],
    },
    {
      id: 'nota-som-r',
      type: 'note',
      tone: 'info',
      text: 'O som desta linha não corresponde exatamente a "R" nem a "L" do português — fica entre os dois. A pronúncia será trabalhada melhor quando o curso tiver o recurso de áudio.',
    },
    {
      id: 'exemplos',
      type: 'example',
      heading: 'Em contexto',
      items: [
        { text: 'さくら', romaji: 'sakura', translation: 'cerejeira' },
        { text: 'とり', romaji: 'tori', translation: 'pássaro' },
      ],
    },
    {
      id: 'quiz-linha-r',
      type: 'multiple_choice',
      prompt: 'Qual caractere tem som "ru"?',
      options: [
        { id: 'ru', text: 'る' },
        { id: 'ro', text: 'ろ' },
        { id: 'ra', text: 'ら' },
      ],
      correctOptionId: 'ru',
    },
    {
      id: 'matching-linha-r',
      type: 'matching',
      prompt: 'Associe cada caractere ao som correspondente.',
      pairs: [
        { id: 'ra', left: 'ら', right: 'ra' },
        { id: 'ri', left: 'り', right: 'ri' },
        { id: 'ru', left: 'る', right: 'ru' },
        { id: 're', left: 'れ', right: 're' },
        { id: 'ro', left: 'ろ', right: 'ro' },
      ],
    },
    {
      id: 'resumo',
      type: 'summary',
      points: [
        'ら、り、る、れ、ろ são os sons r + vogal: ra, ri, ru, re, ro.',
        'A pronúncia exata desse som será trabalhada com áudio em uma fase futura.',
      ],
    },
  ],
});

export default content;

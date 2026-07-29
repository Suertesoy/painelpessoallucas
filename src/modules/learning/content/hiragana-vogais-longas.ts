import { LessonContentSchema, type LessonContent } from '../domain/lesson-content.schema';

/**
 * Conteúdo da lição "Hiragana — Vogais longas" (módulo Fundamentos, curso
 * Japonês). Introdução inicial, não exaustiva — a regra não é apresentada
 * como absoluta (ver nota).
 */
const content: LessonContent = LessonContentSchema.parse({
  blocks: [
    {
      id: 'objective',
      type: 'objective',
      text: 'Reconhecer os padrões mais comuns de vogal longa em hiragana, especialmente おう e えい.',
    },
    {
      id: 'texto-vogais-longas',
      type: 'text',
      heading: 'Sons longos',
      paragraphs: [
        'Uma vogal longa dura o dobro de uma vogal curta — e muda o significado da palavra. No hiragana, esse som longo aparece escrito de formas específicas, não só repetindo a mesma vogal.',
        'Dois padrões muito frequentes: おう (lido como um "o" longo) e えい (lido como um "e" longo). Também é comum repetir a mesma vogal, como em ああ ou いい.',
      ],
    },
    {
      id: 'exemplos',
      type: 'example',
      heading: 'Em contexto',
      items: [
        { text: 'おはよう', romaji: 'ohayou', translation: 'bom dia', note: 'padrão おう' },
        { text: 'せんせい', romaji: 'sensei', translation: 'professor(a)', note: 'padrão えい' },
        { text: 'ほんとう', romaji: 'hontou', translation: 'verdade / de verdade', note: 'padrão おう' },
      ],
    },
    {
      id: 'nota-nao-absoluta',
      type: 'note',
      tone: 'info',
      text: 'Essas não são regras absolutas — existem outras grafias para sons longos. A familiaridade vem com o tempo, praticando vocabulário real, e melhora bastante quando o curso tiver áudio.',
    },
    {
      id: 'quiz-vogais-longas',
      type: 'multiple_choice',
      prompt: 'Qual palavra tem o padrão de som longo "おう"?',
      options: [
        { id: 'ohayou', text: 'おはよう' },
        { id: 'sensei', text: 'せんせい' },
        { id: 'ichi', text: 'いち' },
      ],
      correctOptionId: 'ohayou',
      explanation: 'おはよう termina no padrão "おう", de som "o" longo.',
    },
    {
      id: 'matching-vogais-longas',
      type: 'matching',
      prompt: 'Associe cada padrão ao tipo de som longo.',
      pairs: [
        { id: 'ou', left: 'おう', right: 'som "o" longo' },
        { id: 'ei', left: 'えい', right: 'som "e" longo' },
        { id: 'aa', left: 'ああ', right: 'vogal repetida' },
      ],
    },
    {
      id: 'resumo',
      type: 'summary',
      points: [
        'Vogais longas mudam o significado da palavra.',
        'おう e えい são os padrões mais frequentes de som longo.',
        'A regra não é absoluta — a prática com vocabulário real vai consolidar o reconhecimento.',
      ],
    },
  ],
});

export default content;

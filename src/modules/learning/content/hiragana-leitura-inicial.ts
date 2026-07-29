import { LessonContentSchema, type LessonContent } from '../domain/lesson-content.schema';

/**
 * Conteúdo da lição "Hiragana — Leitura: palavras e expressões frequentes"
 * (módulo Fundamentos, curso Japonês). Prática de leitura, não gramática.
 * だいじょうぶ contém じょ (som combinado + dakuten) ainda não ensinado
 * formalmente — tratado como exposição, fora dos exercícios cobrados.
 */
const content: LessonContent = LessonContentSchema.parse({
  blocks: [
    {
      id: 'objective',
      type: 'objective',
      text: 'Praticar a leitura de palavras e expressões curtas e frequentes, reconhecendo os kana e associando um significado básico.',
    },
    {
      id: 'texto-leitura-inicial',
      type: 'text',
      heading: 'Lendo palavras reais',
      paragraphs: [
        'Esta lição não ensina gramática — é prática de leitura com palavras e expressões curtas que aparecem com frequência no dia a dia e em falas comuns.',
        'Tente ler cada palavra antes de olhar a tradução.',
      ],
    },
    {
      id: 'exemplos',
      type: 'example',
      heading: 'Palavras frequentes',
      items: [
        { text: 'ありがとう', romaji: 'arigatou', translation: 'obrigado(a)' },
        { text: 'おはよう', romaji: 'ohayou', translation: 'bom dia' },
        { text: 'すごい', romaji: 'sugoi', translation: 'incrível' },
        { text: 'かわいい', romaji: 'kawaii', translation: 'fofo(a)' },
        {
          text: 'だいじょうぶ',
          romaji: 'daijoubu',
          translation: 'tudo bem / tranquilo',
          note: 'a sílaba じょ ainda não foi ensinada formalmente — leia esta palavra como exposição',
        },
        { text: 'せんせい', romaji: 'sensei', translation: 'professor(a)' },
        { text: 'ともだち', romaji: 'tomodachi', translation: 'amigo(a)' },
        { text: 'ほんとう', romaji: 'hontou', translation: 'verdade' },
        { text: 'だめ', romaji: 'dame', translation: 'não pode / proibido' },
        { text: 'わたし', romaji: 'watashi', translation: 'eu' },
      ],
    },
    {
      id: 'quiz-leitura-inicial',
      type: 'multiple_choice',
      prompt: 'O que significa ありがとう?',
      options: [
        { id: 'obrigado', text: 'Obrigado(a)' },
        { id: 'bom-dia', text: 'Bom dia' },
        { id: 'amigo', text: 'Amigo(a)' },
      ],
      correctOptionId: 'obrigado',
    },
    {
      id: 'matching-leitura-inicial',
      type: 'matching',
      prompt: 'Associe cada palavra ao significado correspondente.',
      pairs: [
        { id: 'hontou', left: 'ほんとう', right: 'verdade' },
        { id: 'watashi', left: 'わたし', right: 'eu' },
        { id: 'tomodachi', left: 'ともだち', right: 'amigo(a)' },
        { id: 'sugoi', left: 'すごい', right: 'incrível' },
      ],
    },
    {
      id: 'resumo',
      type: 'summary',
      points: [
        'Reconhecer os kana é o primeiro passo — a leitura fica mais natural com prática.',
        'Segmentar a palavra em sílabas ajuda antes de tentar ler tudo de uma vez.',
        'O significado vem junto da leitura, não substitui o hiragana pelo romaji.',
      ],
    },
  ],
});

export default content;

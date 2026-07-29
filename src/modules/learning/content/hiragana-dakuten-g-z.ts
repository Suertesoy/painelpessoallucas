import { LessonContentSchema, type LessonContent } from '../domain/lesson-content.schema';

/**
 * Conteúdo da lição "Hiragana — Sons marcados: G e Z" (módulo Fundamentos,
 * curso Japonês). Primeira lição de dakuten — trata が/ざ como
 * transformações sistemáticas de か/さ (mesma forma, marca a mais), não
 * como 10 símbolos novos e independentes.
 */
const content: LessonContent = LessonContentSchema.parse({
  blocks: [
    {
      id: 'objective',
      type: 'objective',
      text: 'Entender o princípio do dakuten e reconhecer os sons marcados das linhas G e Z: が, ぎ, ぐ, げ, ご, ざ, じ, ず, ぜ, ぞ.',
    },
    {
      id: 'texto-dakuten',
      type: 'text',
      heading: 'O princípio do dakuten',
      paragraphs: [
        'Adicionando duas marcas (゛) a certos hiragana, o som muda de "surdo" para "sonoro": か vira が, さ vira ざ, e assim por diante.',
        'Não são símbolos novos e independentes — são as mesmas formas de K e S que você já conhece, com uma marca a mais.',
      ],
    },
    {
      id: 'kana-dakuten-g',
      type: 'kana',
      heading: 'Linha G (dakuten de K)',
      characters: [
        { character: 'が', romaji: 'ga' },
        { character: 'ぎ', romaji: 'gi' },
        { character: 'ぐ', romaji: 'gu' },
        { character: 'げ', romaji: 'ge' },
        { character: 'ご', romaji: 'go' },
      ],
    },
    {
      id: 'kana-dakuten-z',
      type: 'kana',
      heading: 'Linha Z (dakuten de S)',
      characters: [
        { character: 'ざ', romaji: 'za' },
        { character: 'じ', romaji: 'ji' },
        { character: 'ず', romaji: 'zu' },
        { character: 'ぜ', romaji: 'ze' },
        { character: 'ぞ', romaji: 'zo' },
      ],
    },
    {
      id: 'nota-ji',
      type: 'note',
      tone: 'info',
      text: 'じ é a exceção da linha Z: lê-se "ji", seguindo o mesmo padrão de exceção de し (shi).',
    },
    {
      id: 'exemplos',
      type: 'example',
      heading: 'Em contexto',
      items: [
        { text: 'かぎ', romaji: 'kagi', translation: 'chave' },
        { text: 'かぞく', romaji: 'kazoku', translation: 'família' },
      ],
    },
    {
      id: 'quiz-dakuten-gz',
      type: 'multiple_choice',
      prompt: 'Qual é a versão sonora (dakuten) de か?',
      options: [
        { id: 'ga', text: 'が' },
        { id: 'go', text: 'ご' },
        { id: 'za', text: 'ざ' },
      ],
      correctOptionId: 'ga',
      explanation: 'が é か com dakuten. ご é o dakuten de こ; ざ é o dakuten de さ.',
    },
    {
      id: 'matching-dakuten-gz',
      type: 'matching',
      prompt: 'Associe cada caractere ao som correspondente.',
      pairs: [
        { id: 'ga', left: 'が', right: 'ga' },
        { id: 'gi', left: 'ぎ', right: 'gi' },
        { id: 'za', left: 'ざ', right: 'za' },
        { id: 'ji', left: 'じ', right: 'ji' },
        { id: 'zo', left: 'ぞ', right: 'zo' },
      ],
    },
    {
      id: 'resumo',
      type: 'summary',
      points: [
        'O dakuten (゛) transforma um som surdo em sonoro: か→が, さ→ざ.',
        'が、ぎ、ぐ、げ、ご são os sons g + vogal.',
        'ざ、じ、ず、ぜ、ぞ são os sons z + vogal, com じ lido "ji".',
      ],
    },
  ],
});

export default content;

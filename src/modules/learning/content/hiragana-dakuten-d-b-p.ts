import { LessonContentSchema, type LessonContent } from '../domain/lesson-content.schema';

/**
 * Conteúdo da lição "Hiragana — Sons marcados: D, B e P" (módulo
 * Fundamentos, curso Japonês). Segunda lição de dakuten/handakuten — trata
 * だ/ば/ぱ como transformações de た/は, não como alfabetos independentes.
 */
const content: LessonContent = LessonContentSchema.parse({
  blocks: [
    {
      id: 'objective',
      type: 'objective',
      text: 'Reconhecer os sons marcados das linhas D, B e P: だ, ぢ, づ, で, ど, ば, び, ぶ, べ, ぼ, ぱ, ぴ, ぷ, ぺ, ぽ.',
    },
    {
      id: 'texto-dakuten-handakuten',
      type: 'text',
      heading: 'Dakuten em T e H, e o handakuten de H',
      paragraphs: [
        'O mesmo princípio do dakuten se aplica à linha T (que vira D) e à linha H (que vira B): た→だ, は→ば.',
        'A linha H tem ainda uma segunda marca, o handakuten (゜), que produz o som "p": は→ぱ.',
      ],
    },
    {
      id: 'kana-dakuten-d',
      type: 'kana',
      heading: 'Linha D (dakuten de T)',
      characters: [
        { character: 'だ', romaji: 'da' },
        { character: 'ぢ', romaji: 'ji' },
        { character: 'づ', romaji: 'zu' },
        { character: 'で', romaji: 'de' },
        { character: 'ど', romaji: 'do' },
      ],
    },
    {
      id: 'kana-dakuten-b',
      type: 'kana',
      heading: 'Linha B (dakuten de H)',
      characters: [
        { character: 'ば', romaji: 'ba' },
        { character: 'び', romaji: 'bi' },
        { character: 'ぶ', romaji: 'bu' },
        { character: 'べ', romaji: 'be' },
        { character: 'ぼ', romaji: 'bo' },
      ],
    },
    {
      id: 'kana-handakuten-p',
      type: 'kana',
      heading: 'Linha P (handakuten de H)',
      characters: [
        { character: 'ぱ', romaji: 'pa' },
        { character: 'ぴ', romaji: 'pi' },
        { character: 'ぷ', romaji: 'pu' },
        { character: 'ぺ', romaji: 'pe' },
        { character: 'ぽ', romaji: 'po' },
      ],
    },
    {
      id: 'nota-ji-zu-raros',
      type: 'note',
      tone: 'info',
      text: 'ぢ e づ são pouco comuns — na maioria das palavras do dia a dia, você verá じ e ず no lugar delas, com o mesmo som.',
    },
    {
      id: 'exemplos',
      type: 'example',
      heading: 'Em contexto',
      items: [
        { text: 'たべもの', romaji: 'tabemono', translation: 'comida' },
        { text: 'えんぴつ', romaji: 'enpitsu', translation: 'lápis' },
      ],
    },
    {
      id: 'quiz-handakuten-p',
      type: 'multiple_choice',
      prompt: 'Qual é a versão com handakuten (゜) de は?',
      options: [
        { id: 'pa', text: 'ぱ' },
        { id: 'ba', text: 'ば' },
        { id: 'ha', text: 'は' },
      ],
      correctOptionId: 'pa',
      explanation: 'ぱ tem handakuten (゜); ば tem dakuten (゛); は é a forma original, sem marca.',
    },
    {
      id: 'matching-dakuten-dbp',
      type: 'matching',
      prompt: 'Associe cada caractere ao som correspondente.',
      pairs: [
        { id: 'da', left: 'だ', right: 'da' },
        { id: 'ba', left: 'ば', right: 'ba' },
        { id: 'pa', left: 'ぱ', right: 'pa' },
        { id: 'do', left: 'ど', right: 'do' },
        { id: 'bo', left: 'ぼ', right: 'bo' },
      ],
    },
    {
      id: 'resumo',
      type: 'summary',
      points: [
        'だ、で、ど seguem o padrão regular; ぢ e づ são raros — geralmente você verá じ e ず.',
        'ば、び、ぶ、べ、ぼ são os sons b + vogal (dakuten de H).',
        'ぱ、ぴ、ぷ、ぺ、ぽ são os sons p + vogal (handakuten de H).',
      ],
    },
  ],
});

export default content;

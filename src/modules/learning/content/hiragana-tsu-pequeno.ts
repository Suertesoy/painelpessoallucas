import { LessonContentSchema, type LessonContent } from '../domain/lesson-content.schema';

/**
 * Conteúdo da lição "Hiragana — Consoante duplicada: っ pequeno" (módulo
 * Fundamentos, curso Japonês). がっこう expõe o padrão de som longo "おう"
 * antes de ele ser formalmente ensinado — sinalizado explicitamente como
 * prática de leitura, não conteúdo cobrado.
 */
const content: LessonContent = LessonContentSchema.parse({
  blocks: [
    {
      id: 'objective',
      type: 'objective',
      text: 'Entender que っ pequeno indica uma pequena pausa e geralmente duplica a consoante seguinte.',
    },
    {
      id: 'texto-tsu-pequeno',
      type: 'text',
      heading: 'つ grande e っ pequeno',
      paragraphs: [
        'つ, no tamanho normal, é a sílaba "tsu" da linha T.',
        'っ, bem menor, não tem som próprio: indica uma pequena pausa antes da consoante seguinte, que soa "dobrada".',
        'Por exemplo, きて (sem っ) e きって (com っ) se pronunciam de forma diferente, com uma pausa antes do "t" em きって.',
      ],
    },
    {
      id: 'kana-tsu-pequeno',
      type: 'kana',
      heading: 'つ vs っ',
      characters: [
        { character: 'つ', romaji: 'tsu' },
        { character: 'っ', romaji: '(pausa)' },
      ],
    },
    {
      id: 'exemplos',
      type: 'example',
      heading: 'Em contexto',
      items: [
        { text: 'きって', romaji: 'kitte', translation: 'selo (postal)', note: 'pausa antes do "t"' },
        {
          text: 'がっこう',
          romaji: 'gakkou',
          translation: 'escola',
          note: 'a parte "こう" tem som longo — você vai estudar isso na próxima lição',
        },
      ],
    },
    {
      id: 'quiz-tsu-pequeno',
      type: 'multiple_choice',
      prompt: 'O que っ pequeno indica?',
      options: [
        { id: 'pausa', text: 'Uma pausa antes da consoante seguinte' },
        { id: 'vogal-u', text: 'A vogal "u"' },
        { id: 'igual-tsu', text: 'O mesmo som que つ grande' },
      ],
      correctOptionId: 'pausa',
      explanation: 'っ pequeno não tem som próprio — só indica a pausa que "dobra" a consoante seguinte.',
    },
    {
      id: 'matching-tsu-pequeno',
      type: 'matching',
      prompt: 'Associe cada palavra à leitura correspondente.',
      pairs: [
        { id: 'kite', left: 'きて', right: 'kite (sem pausa)' },
        { id: 'kitte', left: 'きって', right: 'kitte (com pausa)' },
        { id: 'gakkou', left: 'がっこう', right: 'gakkou' },
      ],
    },
    {
      id: 'resumo',
      type: 'summary',
      points: [
        'っ pequeno não tem som próprio: indica uma pausa breve antes da consoante seguinte.',
        'Visualmente, っ é bem menor que つ.',
        'Você vai encontrar palavras com sons longos (como em がっこう) — o assunto da próxima lição.',
      ],
    },
  ],
});

export default content;

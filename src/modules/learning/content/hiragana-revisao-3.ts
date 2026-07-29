import { LessonContentSchema, type LessonContent } from '../domain/lesson-content.schema';

/**
 * Conteúdo da lição "Hiragana — Revisão: básico completo" (módulo
 * Fundamentos, curso Japonês). Revisão cumulativa dos 46 símbolos básicos,
 * distribuída em atividades curtas — sem exigir um único exercício
 * gigante.
 */
const content: LessonContent = LessonContentSchema.parse({
  blocks: [
    {
      id: 'objective',
      type: 'objective',
      text: 'Revisar o conjunto completo dos 46 símbolos básicos do hiragana.',
    },
    {
      id: 'texto-revisao-3',
      type: 'text',
      heading: 'Os 46 símbolos básicos',
      paragraphs: [
        'Você já viu todas as vogais e linhas do hiragana básico: vogais, K, S, T, N, H, M, Y, R, W e ん. Esta lição não traz símbolos novos — é revisão cumulativa, dividida em atividades menores.',
      ],
    },
    {
      id: 'exemplos',
      type: 'example',
      heading: 'Em contexto',
      items: [
        { text: 'さかな', romaji: 'sakana', translation: 'peixe' },
        { text: 'くるま', romaji: 'kuruma', translation: 'carro' },
      ],
    },
    {
      id: 'quiz-revisao-3a',
      type: 'multiple_choice',
      prompt: 'Qual destes é ぬ (nu)?',
      options: [
        { id: 'nu', text: 'ぬ' },
        { id: 'me', text: 'め' },
        { id: 'ne', text: 'ね' },
      ],
      correctOptionId: 'nu',
      explanation: 'ぬ e め têm formas parecidas — vale prestar atenção na diferença.',
    },
    {
      id: 'quiz-revisao-3b',
      type: 'multiple_choice',
      prompt: 'Qual caractere tem som "ro"?',
      options: [
        { id: 'ro', text: 'ろ' },
        { id: 'ru', text: 'る' },
        { id: 'wa', text: 'わ' },
      ],
      correctOptionId: 'ro',
      explanation: 'る e ろ também têm formas parecidas — vale prestar atenção na diferença.',
    },
    {
      id: 'matching-revisao-3a',
      type: 'matching',
      prompt: 'Associe cada caractere ao som correspondente (parte 1).',
      pairs: [
        { id: 'a', left: 'あ', right: 'a' },
        { id: 'ka', left: 'か', right: 'ka' },
        { id: 'sa', left: 'さ', right: 'sa' },
        { id: 'na', left: 'な', right: 'na' },
        { id: 'ha', left: 'は', right: 'ha' },
        { id: 'ma', left: 'ま', right: 'ma' },
      ],
    },
    {
      id: 'matching-revisao-3b',
      type: 'matching',
      prompt: 'Associe cada caractere ao som correspondente (parte 2).',
      pairs: [
        { id: 'ya', left: 'や', right: 'ya' },
        { id: 'ra', left: 'ら', right: 'ra' },
        { id: 'wa', left: 'わ', right: 'wa' },
        { id: 'n', left: 'ん', right: 'n' },
        { id: 'o', left: 'を', right: 'o' },
      ],
    },
    {
      id: 'resumo',
      type: 'summary',
      points: [
        'Vogais: あ・い・う・え・お',
        'K: か・き・く・け・こ',
        'S: さ・し・す・せ・そ',
        'T: た・ち・つ・て・と',
        'N: な・に・ぬ・ね・の',
        'H: は・ひ・ふ・へ・ほ',
        'M: ま・み・む・め・も',
        'Y: や・ゆ・よ',
        'R: ら・り・る・れ・ろ',
        'W e ん: わ・を・ん',
      ],
    },
  ],
});

export default content;

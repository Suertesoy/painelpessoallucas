import { LessonContentSchema, type LessonContent } from '../domain/lesson-content.schema';

/**
 * Conteúdo da lição "Introdução ao curso" (módulo Fundamentos, curso
 * Japonês). Puro dado — nenhum componente React é criado por lição; quem
 * renderiza este conteúdo é `LessonRenderer`, genérico para qualquer curso.
 *
 * `.parse` roda na importação: conteúdo inválido quebra o build/teste
 * imediatamente, com o erro do Zod apontando o campo exato.
 */
const content: LessonContent = LessonContentSchema.parse({
  blocks: [
    {
      id: 'objective',
      type: 'objective',
      text: 'Entender como o curso de Japonês está estruturado e como estudar de forma consistente.',
    },
    {
      id: 'como-funciona',
      type: 'text',
      heading: 'Como o curso funciona',
      paragraphs: [
        'O curso é dividido em módulos — Fundamentos, Gramática, Vocabulário, Kanji e Leitura — liberados conforme você avança.',
        'Cada lição é composta pelos mesmos blocos de conteúdo: explicações, exemplos, notas e exercícios curtos, sempre no mesmo formato.',
      ],
    },
    {
      id: 'nota-meta',
      type: 'note',
      tone: 'tip',
      text: 'A meta diária pode ser ajustada a qualquer momento em Configurações (de 5 a 180 minutos).',
    },
    {
      id: 'nota-leitura',
      type: 'note',
      tone: 'info',
      text: 'Romaji e furigana aparecem como apoio de leitura enquanto você ainda não reconhece os caracteres — também configuráveis por curso.',
    },
    {
      id: 'quiz-modulo-disponivel',
      type: 'multiple_choice',
      prompt: 'Qual módulo já está disponível para você começar agora?',
      options: [
        { id: 'fundamentos', text: 'Fundamentos' },
        { id: 'gramatica', text: 'Gramática' },
        { id: 'kanji', text: 'Kanji' },
      ],
      correctOptionId: 'fundamentos',
      explanation: 'Os demais módulos são liberados conforme o progresso nos anteriores.',
    },
    {
      id: 'resumo',
      type: 'summary',
      points: [
        'O curso avança por módulos, do mais básico ao mais avançado.',
        'Cada lição segue blocos previsíveis: objetivo, conteúdo, exemplos e exercícios.',
        'A meta diária e as preferências de leitura são ajustáveis em Configurações.',
      ],
    },
  ],
});

export default content;

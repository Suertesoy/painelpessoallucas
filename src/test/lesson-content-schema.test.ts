import { describe, it, expect } from 'vitest';
import { LessonContentSchema, LessonBlockSchema } from '@/modules/learning/domain/lesson-content.schema';

function validContent() {
  return {
    blocks: [
      { id: 'obj', type: 'objective', text: 'Objetivo' },
      { id: 'txt', type: 'text', paragraphs: ['Parágrafo'] },
      {
        id: 'mc',
        type: 'multiple_choice',
        prompt: 'Pergunta?',
        options: [
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
        ],
        correctOptionId: 'a',
      },
      { id: 'sum', type: 'summary', points: ['Ponto'] },
    ],
  };
}

describe('LessonContentSchema — estrutura da lição', () => {
  it('aceita um conteúdo válido que começa em objective e termina em summary', () => {
    expect(() => LessonContentSchema.parse(validContent())).not.toThrow();
  });

  it('rejeita lição sem blocos', () => {
    expect(() => LessonContentSchema.parse({ blocks: [] })).toThrow();
  });

  it('rejeita lição que não começa com objective', () => {
    const content = validContent();
    content.blocks = content.blocks.slice(1) as typeof content.blocks;
    expect(() => LessonContentSchema.parse(content)).toThrow(/começar com um bloco do tipo/);
  });

  it('rejeita lição que não termina com summary', () => {
    const content = validContent();
    content.blocks = content.blocks.slice(0, -1) as typeof content.blocks;
    expect(() => LessonContentSchema.parse(content)).toThrow(/terminar com um bloco do tipo/);
  });

  it('rejeita IDs de bloco duplicados', () => {
    const content = validContent();
    content.blocks[1] = { ...content.blocks[1], id: 'obj' };
    expect(() => LessonContentSchema.parse(content)).toThrow(/IDs de bloco duplicados/);
  });
});

describe('LessonBlockSchema — bloco multiple_choice', () => {
  it('rejeita correctOptionId que não referencia nenhuma option', () => {
    expect(() =>
      LessonBlockSchema.parse({
        id: 'mc',
        type: 'multiple_choice',
        prompt: 'Pergunta?',
        options: [
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
        ],
        correctOptionId: 'c',
      })
    ).toThrow(/correctOptionId precisa referenciar/);
  });

  it('rejeita menos de duas opções', () => {
    expect(() =>
      LessonBlockSchema.parse({
        id: 'mc',
        type: 'multiple_choice',
        prompt: 'Pergunta?',
        options: [{ id: 'a', text: 'A' }],
        correctOptionId: 'a',
      })
    ).toThrow();
  });
});

describe('LessonBlockSchema — bloco matching', () => {
  it('rejeita IDs de par duplicados', () => {
    expect(() =>
      LessonBlockSchema.parse({
        id: 'match',
        type: 'matching',
        prompt: 'Associe',
        pairs: [
          { id: 'a', left: 'あ', right: 'a' },
          { id: 'a', left: 'い', right: 'i' },
        ],
      })
    ).toThrow(/IDs de par duplicados/);
  });
});

describe('LessonBlockSchema — bloco note', () => {
  it('assume tone "info" quando não informado', () => {
    const block = LessonBlockSchema.parse({ id: 'n', type: 'note', text: 'Nota' });
    expect(block).toMatchObject({ tone: 'info' });
  });
});

describe('LessonBlockSchema — bloco example, campo romaji opcional', () => {
  it('aceita um item de exemplo com romaji, distinto de note e translation', () => {
    const block = LessonBlockSchema.parse({
      id: 'ex',
      type: 'example',
      items: [{ text: 'すし', romaji: 'sushi', translation: 'sushi', note: 'su + shi' }],
    });
    expect(block).toMatchObject({ items: [{ text: 'すし', romaji: 'sushi', translation: 'sushi', note: 'su + shi' }] });
  });

  it('aceita um item de exemplo sem romaji (retrocompatível)', () => {
    expect(() =>
      LessonBlockSchema.parse({ id: 'ex', type: 'example', items: [{ text: 'あい', translation: 'amor' }] })
    ).not.toThrow();
  });
});

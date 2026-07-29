// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { LessonRenderer } from '@/components/learning/lesson-renderer';
import type { Lesson } from '@/modules/learning/domain/learning.schema';
import type { LessonProgress } from '@/modules/learning/domain/lesson-progress.schema';
import { LessonContentSchema } from '@/modules/learning/domain/lesson-content.schema';

const recordLessonViewed = vi.fn().mockResolvedValue(undefined);
const recordExerciseResult = vi.fn().mockResolvedValue(undefined);
const completeLesson = vi.fn().mockResolvedValue(undefined);

vi.mock('@/providers/repository.provider', () => ({
  useCommands: () => ({
    learning: { recordLessonViewed, recordExerciseResult, completeLesson },
  }),
}));

const COURSE_ID = '44444444-4444-4444-8444-444444444444';
const MODULE_ID = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  recordLessonViewed.mockClear();
  recordExerciseResult.mockClear();
  completeLesson.mockClear().mockResolvedValue(undefined);
});
afterEach(cleanup);

function buildLesson(): Lesson {
  const content = LessonContentSchema.parse({
    blocks: [
      { id: 'obj', type: 'objective', text: 'Reconhecer as vogais.' },
      { id: 'txt', type: 'text', heading: 'Título', paragraphs: ['Parágrafo de conteúdo.'] },
      {
        id: 'kana',
        type: 'kana',
        characters: [
          { character: 'う', romaji: 'u' },
          { character: 'え', romaji: 'e' },
        ],
      },
      { id: 'ex', type: 'example', items: [{ text: 'あい', translation: 'amor' }] },
      { id: 'note', type: 'note', tone: 'tip', text: 'Dica de estudo.' },
      {
        id: 'mc',
        type: 'multiple_choice',
        prompt: 'Qual é o som de あ?',
        options: [
          { id: 'a', text: 'Som "a"' },
          { id: 'b', text: 'Som "i"' },
        ],
        correctOptionId: 'a',
        explanation: 'あ tem som "a".',
      },
      {
        id: 'match',
        type: 'matching',
        prompt: 'Associe.',
        pairs: [
          { id: 'a', left: 'あ', right: 'a' },
          { id: 'i', left: 'い', right: 'i' },
        ],
      },
      { id: 'sum', type: 'summary', points: ['Ponto final.'] },
    ],
  });

  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    moduleId: MODULE_ID,
    contentKey: 'licao-teste',
    title: 'Lição de teste',
    position: 0,
    content,
    createdAt: '2026-07-29T10:00:00.000Z',
    updatedAt: '2026-07-29T10:00:00.000Z',
  };
}

function buildProgress(overrides: Partial<LessonProgress> = {}): LessonProgress {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    courseId: COURSE_ID,
    moduleId: MODULE_ID,
    lessonId: '11111111-1111-4111-8111-111111111111',
    totalExercises: 2,
    answeredCount: 0,
    resolvedCount: 0,
    attempts: {},
    status: 'in_progress',
    startedAt: '2026-07-29T10:00:00.000Z',
    lastActivityAt: '2026-07-29T10:00:00.000Z',
    createdAt: '2026-07-29T10:00:00.000Z',
    updatedAt: '2026-07-29T10:00:00.000Z',
    ...overrides,
  };
}

describe('LessonRenderer — renderiza blocos em sequência sem conhecer a lição', () => {
  it('renderiza todos os tipos de bloco da lição', () => {
    render(<LessonRenderer lesson={buildLesson()} courseId={COURSE_ID} moduleId={MODULE_ID} progress={null} />);

    expect(screen.getByText('Reconhecer as vogais.')).toBeTruthy();
    expect(screen.getByText('Parágrafo de conteúdo.')).toBeTruthy();
    expect(screen.getByText('う')).toBeTruthy();
    expect(screen.getByText('amor')).toBeTruthy();
    expect(screen.getByText('Dica de estudo.')).toBeTruthy();
    expect(screen.getByText('Qual é o som de あ?')).toBeTruthy();
    expect(screen.getByText('Associe.')).toBeTruthy();
    expect(screen.getByText('Ponto final.')).toBeTruthy();
  });

  it('registra a visualização da lição ao montar', () => {
    const lesson = buildLesson();
    render(<LessonRenderer lesson={lesson} courseId={COURSE_ID} moduleId={MODULE_ID} progress={null} />);

    expect(recordLessonViewed).toHaveBeenCalledWith(lesson.workspaceId, {
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      lessonId: lesson.id,
    });
  });
});

describe('LessonRenderer — exercício errado não trava: aprendizagem, não avaliação', () => {
  it('resposta incorreta mostra feedback e permite nova tentativa; acertar resolve e trava', () => {
    const lesson = buildLesson();
    render(<LessonRenderer lesson={lesson} courseId={COURSE_ID} moduleId={MODULE_ID} progress={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Som "i"' })); // errado
    expect(screen.getByText(/Não foi dessa vez/)).toBeTruthy();
    expect(recordExerciseResult).toHaveBeenCalledWith(lesson.workspaceId, {
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      lessonId: lesson.id,
      blockId: 'mc',
      outcome: 'incorrect',
    });
    // Continua respondível — o botão certo não está desabilitado.
    expect(screen.getByRole('button', { name: 'Som "a"' }).hasAttribute('disabled')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Som "a"' })); // acerta
    expect(recordExerciseResult).toHaveBeenLastCalledWith(lesson.workspaceId, {
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      lessonId: lesson.id,
      blockId: 'mc',
      outcome: 'correct',
    });
    // Resolvido: agora trava.
    expect(screen.getByRole('button', { name: 'Som "a"' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/1 resolvido\(s\)/)).toBeTruthy();
  });

  it('restaura uma tentativa incorreta persistida ao montar: continua respondível (refresh não trava um erro)', () => {
    const lesson = buildLesson();
    const progress = buildProgress({
      lessonId: lesson.id,
      answeredCount: 1,
      resolvedCount: 0,
      attempts: { mc: { firstOutcome: 'incorrect', latestOutcome: 'incorrect', attemptCount: 1 } },
    });
    render(<LessonRenderer lesson={lesson} courseId={COURSE_ID} moduleId={MODULE_ID} progress={progress} />);

    expect(screen.getByText(/Não foi dessa vez/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Som "a"' }).hasAttribute('disabled')).toBe(false);
  });

  it('restaura um exercício já resolvido ao montar: trava mostrando a resposta correta', () => {
    const lesson = buildLesson();
    const progress = buildProgress({
      lessonId: lesson.id,
      answeredCount: 1,
      resolvedCount: 1,
      attempts: {
        mc: { firstOutcome: 'incorrect', latestOutcome: 'correct', attemptCount: 2, resolvedAt: '2026-07-29T10:01:00.000Z' },
      },
    });
    render(<LessonRenderer lesson={lesson} courseId={COURSE_ID} moduleId={MODULE_ID} progress={progress} />);

    expect(screen.getByRole('button', { name: 'Som "a"' }).hasAttribute('disabled')).toBe(true);
    // Idempotente: clicar (via evento sintético, já que o botão está disabled) não chama o command de novo.
    fireEvent.click(screen.getByRole('button', { name: 'Som "a"' }));
    expect(recordExerciseResult).not.toHaveBeenCalled();
  });
});

describe('LessonRenderer — conclusão consciente', () => {
  it('conclui diretamente quando não há exercícios pendentes', async () => {
    const lesson = buildLesson();
    const progress = buildProgress({
      lessonId: lesson.id,
      answeredCount: 2,
      resolvedCount: 2,
      attempts: {
        mc: { firstOutcome: 'correct', latestOutcome: 'correct', attemptCount: 1, resolvedAt: '2026-07-29T10:01:00.000Z' },
        match: { firstOutcome: 'correct', latestOutcome: 'correct', attemptCount: 1, resolvedAt: '2026-07-29T10:01:00.000Z' },
      },
    });
    render(<LessonRenderer lesson={lesson} courseId={COURSE_ID} moduleId={MODULE_ID} progress={progress} />);

    fireEvent.click(screen.getByRole('button', { name: /Concluir lição/ }));

    await waitFor(() => expect(completeLesson).toHaveBeenCalledWith(lesson.workspaceId, {
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      lessonId: lesson.id,
    }));
    await waitFor(() => expect(screen.getByText('Lição concluída')).toBeTruthy());
  });

  it('mostra confirmação antes de concluir com exercícios pendentes; só chama o command após confirmar', async () => {
    const lesson = buildLesson();
    render(<LessonRenderer lesson={lesson} courseId={COURSE_ID} moduleId={MODULE_ID} progress={null} />);

    fireEvent.click(screen.getByRole('button', { name: /Concluir lição/ }));
    expect(completeLesson).not.toHaveBeenCalled();
    expect(screen.getByText(/pendente/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Concluir mesmo assim' }));
    await waitFor(() => expect(completeLesson).toHaveBeenCalledTimes(1));
  });

  it('lição já concluída mostra o selo, sem botão de concluir', () => {
    const lesson = buildLesson();
    const progress = buildProgress({ lessonId: lesson.id, status: 'completed', completedAt: '2026-07-29T10:05:00.000Z' });
    render(<LessonRenderer lesson={lesson} courseId={COURSE_ID} moduleId={MODULE_ID} progress={progress} />);

    expect(screen.getByText('Lição concluída')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Concluir lição/ })).toBeNull();
  });

  it('lição sem exercícios não conclui sozinha ao montar — precisa da ação explícita', () => {
    const lesson = buildLesson();
    lesson.content = LessonContentSchema.parse({
      blocks: [
        { id: 'obj', type: 'objective', text: 'Objetivo' },
        { id: 'sum', type: 'summary', points: ['Ponto'] },
      ],
    });
    render(<LessonRenderer lesson={lesson} courseId={COURSE_ID} moduleId={MODULE_ID} progress={null} />);

    expect(screen.queryByText('Lição concluída')).toBeNull();
    expect(screen.getByRole('button', { name: /Concluir lição/ })).toBeTruthy();
    expect(completeLesson).not.toHaveBeenCalled();
  });

  it('exercício ainda pendente continua respondível mesmo com a lição já concluída', () => {
    const lesson = buildLesson();
    const progress = buildProgress({
      lessonId: lesson.id,
      status: 'completed',
      completedAt: '2026-07-29T10:05:00.000Z',
      answeredCount: 0,
      resolvedCount: 0,
      attempts: {},
    });
    render(<LessonRenderer lesson={lesson} courseId={COURSE_ID} moduleId={MODULE_ID} progress={progress} />);

    expect(screen.getByText('Lição concluída')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Som "a"' });
    expect(button.hasAttribute('disabled')).toBe(false);

    fireEvent.click(button);
    expect(recordExerciseResult).toHaveBeenCalledWith(lesson.workspaceId, {
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      lessonId: lesson.id,
      blockId: 'mc',
      outcome: 'correct',
    });
  });
});

describe('LessonRenderer — pluralização do aviso de pendências', () => {
  it('mostra singular quando resta exatamente 1 exercício pendente', () => {
    const lesson = buildLesson();
    const progress = buildProgress({
      lessonId: lesson.id,
      answeredCount: 1,
      resolvedCount: 1,
      attempts: { mc: { firstOutcome: 'correct', latestOutcome: 'correct', attemptCount: 1, resolvedAt: '2026-07-29T10:01:00.000Z' } },
    });
    render(<LessonRenderer lesson={lesson} courseId={COURSE_ID} moduleId={MODULE_ID} progress={progress} />);

    fireEvent.click(screen.getByRole('button', { name: /Concluir lição/ }));
    expect(screen.getByText('Ainda há 1 exercício pendente. Concluir mesmo assim?')).toBeTruthy();
  });

  it('mostra plural quando restam 2 ou mais exercícios pendentes', () => {
    const lesson = buildLesson();
    render(<LessonRenderer lesson={lesson} courseId={COURSE_ID} moduleId={MODULE_ID} progress={null} />);

    fireEvent.click(screen.getByRole('button', { name: /Concluir lição/ }));
    expect(screen.getByText('Ainda há 2 exercícios pendentes. Concluir mesmo assim?')).toBeTruthy();
  });
});

describe('LessonRenderer — falha do Command não deixa estado otimista permanente', () => {
  it('resposta de exercício: falha ao persistir reverte a UI e mostra erro visível', async () => {
    recordExerciseResult.mockRejectedValueOnce(new Error('network down'));
    const lesson = buildLesson();
    render(<LessonRenderer lesson={lesson} courseId={COURSE_ID} moduleId={MODULE_ID} progress={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Som "a"' })); // acerta, mas o Command vai falhar

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText(/Não foi possível salvar sua resposta/)).toBeTruthy();
    // Reverteu: o bloco remontou sem seleção, o botão certo não está mais travado.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Som "a"' }).hasAttribute('disabled')).toBe(false)
    );
    expect(screen.getByText(/0 de 2 exercício\(s\) respondido\(s\)/)).toBeTruthy();

    // Tentando de novo com o Command funcionando, a resposta é aceita normalmente.
    recordExerciseResult.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Som "a"' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Som "a"' }).hasAttribute('disabled')).toBe(true)
    );
  });

  it('conclusão: falha ao persistir mantém a lição não concluída e mostra erro visível', async () => {
    completeLesson.mockRejectedValueOnce(new Error('network down'));
    const lesson = buildLesson();
    const progress = buildProgress({
      lessonId: lesson.id,
      answeredCount: 2,
      resolvedCount: 2,
      attempts: {
        mc: { firstOutcome: 'correct', latestOutcome: 'correct', attemptCount: 1, resolvedAt: '2026-07-29T10:01:00.000Z' },
        match: { firstOutcome: 'correct', latestOutcome: 'correct', attemptCount: 1, resolvedAt: '2026-07-29T10:01:00.000Z' },
      },
    });
    render(<LessonRenderer lesson={lesson} courseId={COURSE_ID} moduleId={MODULE_ID} progress={progress} />);

    fireEvent.click(screen.getByRole('button', { name: /Concluir lição/ }));

    await waitFor(() => expect(screen.getByText(/Não foi possível concluir a lição/)).toBeTruthy());
    expect(screen.queryByText('Lição concluída')).toBeNull();
  });
});

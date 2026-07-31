// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Suspense } from 'react';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import ModuloDetalhePage from '@/app/aprendizado/[courseId]/modulos/[moduleId]/page';

/**
 * Cobre o item 5 (integração com módulos): a página do módulo precisa
 * refletir visualmente a conclusão de uma lição, derivada de progresso
 * real — nunca um percentual fictício — e o item 6 (falha de repositório
 * apresentada corretamente, nunca como lista vazia).
 */

const fakeRepo = { subscribe: () => () => {} };
const COURSE_ID = '44444444-4444-4444-8444-444444444444';
const MODULE_ID = '33333333-3333-4333-8333-333333333333';
const LESSON_DONE_ID = '11111111-1111-4111-8111-111111111111';
const LESSON_PENDING_ID = '11111111-1111-4111-8111-111111111112';

const getCourseById = vi.fn().mockResolvedValue({
  id: COURSE_ID,
  workspaceId: 'ws-1',
  slug: 'japones',
  title: 'Japonês',
  status: 'active',
  dailyGoalMinutes: 15,
  createdAt: '2026-07-29T10:00:00.000Z',
  updatedAt: '2026-07-29T10:00:00.000Z',
});
const getModuleById = vi.fn().mockResolvedValue({
  id: MODULE_ID,
  workspaceId: 'ws-1',
  courseId: COURSE_ID,
  title: 'Fundamentos',
  position: 0,
  status: 'available',
  lessonsCount: 2,
  createdAt: '2026-07-29T10:00:00.000Z',
  updatedAt: '2026-07-29T10:00:00.000Z',
});
const listLessonsByModule = vi.fn().mockResolvedValue([
  {
    id: LESSON_DONE_ID,
    workspaceId: 'ws-1',
    moduleId: MODULE_ID,
    contentKey: 'introducao-ao-curso',
    title: 'Introdução ao curso',
    position: 0,
    content: { blocks: [{ id: 'obj', type: 'objective', text: 'x' }, { id: 'sum', type: 'summary', points: ['x'] }] },
    createdAt: '2026-07-29T10:00:00.000Z',
    updatedAt: '2026-07-29T10:00:00.000Z',
  },
  {
    id: LESSON_PENDING_ID,
    workspaceId: 'ws-1',
    moduleId: MODULE_ID,
    contentKey: 'hiragana-vogais',
    title: 'Hiragana — Vogais',
    position: 1,
    content: { blocks: [{ id: 'obj', type: 'objective', text: 'x' }, { id: 'sum', type: 'summary', points: ['x'] }] },
    createdAt: '2026-07-29T10:00:00.000Z',
    updatedAt: '2026-07-29T10:00:00.000Z',
  },
]);
const listLessonProgressByModule = vi.fn().mockResolvedValue([
  {
    id: 'p1',
    workspaceId: 'ws-1',
    courseId: COURSE_ID,
    moduleId: MODULE_ID,
    lessonId: LESSON_DONE_ID,
    totalExercises: 0,
    answeredCount: 0,
    resolvedCount: 0,
    attempts: {},
    status: 'completed',
    startedAt: '2026-07-29T10:00:00.000Z',
    lastActivityAt: '2026-07-29T10:00:00.000Z',
    completedAt: '2026-07-29T10:00:00.000Z',
    createdAt: '2026-07-29T10:00:00.000Z',
    updatedAt: '2026-07-29T10:00:00.000Z',
  },
]);

vi.mock('@/providers/repository.provider', () => ({
  useRepositories: () => ({
    itemRepository: fakeRepo,
    projectRepository: fakeRepo,
    dailyPlanRepository: fakeRepo,
    calendarEventLinkRepository: fakeRepo,
    learningContentRepository: fakeRepo,
    studySessionRepository: fakeRepo,
    lessonProgressRepository: fakeRepo,
    shoppingListRepository: fakeRepo,
  }),
  useQueries: () => ({
    learning: { getCourseById, getModuleById, listLessonsByModule, listLessonProgressByModule },
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ModuloDetalhePage — conclusão de lições derivada de progresso real', () => {
  it('mostra a contagem de lições concluídas e o selo na lição concluída', async () => {
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <ModuloDetalhePage params={Promise.resolve({ courseId: COURSE_ID, moduleId: MODULE_ID })} />
        </Suspense>
      );
    });

    await waitFor(() => expect(screen.getByText('Introdução ao curso', { exact: false })).toBeTruthy());
    expect(screen.getByText('1 de 2 concluída(s)')).toBeTruthy();
    expect(screen.getByLabelText('Concluída')).toBeTruthy();
  });

  it('destaca com "Recomendada" a primeira lição ainda não concluída, pela posição', async () => {
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <ModuloDetalhePage params={Promise.resolve({ courseId: COURSE_ID, moduleId: MODULE_ID })} />
        </Suspense>
      );
    });

    await waitFor(() => expect(screen.getByText('Introdução ao curso', { exact: false })).toBeTruthy());
    // LESSON_DONE_ID (posição 0) está concluída; LESSON_PENDING_ID (posição 1) é a recomendada.
    expect(screen.getAllByText('Recomendada')).toHaveLength(1);
  });

  it('sem destaque "Recomendada" quando todas as lições já estão concluídas', async () => {
    listLessonProgressByModule.mockResolvedValueOnce([
      { id: 'p1', workspaceId: 'ws-1', courseId: COURSE_ID, moduleId: MODULE_ID, lessonId: LESSON_DONE_ID, totalExercises: 0, answeredCount: 0, resolvedCount: 0, attempts: {}, status: 'completed', startedAt: '2026-07-29T10:00:00.000Z', lastActivityAt: '2026-07-29T10:00:00.000Z', completedAt: '2026-07-29T10:00:00.000Z', createdAt: '2026-07-29T10:00:00.000Z', updatedAt: '2026-07-29T10:00:00.000Z' },
      { id: 'p2', workspaceId: 'ws-1', courseId: COURSE_ID, moduleId: MODULE_ID, lessonId: LESSON_PENDING_ID, totalExercises: 0, answeredCount: 0, resolvedCount: 0, attempts: {}, status: 'completed', startedAt: '2026-07-29T10:00:00.000Z', lastActivityAt: '2026-07-29T10:00:00.000Z', completedAt: '2026-07-29T10:00:00.000Z', createdAt: '2026-07-29T10:00:00.000Z', updatedAt: '2026-07-29T10:00:00.000Z' },
    ]);

    await act(async () => {
      render(
        <Suspense fallback={null}>
          <ModuloDetalhePage params={Promise.resolve({ courseId: COURSE_ID, moduleId: MODULE_ID })} />
        </Suspense>
      );
    });

    await waitFor(() => expect(screen.getByText('2 de 2 concluída(s)')).toBeTruthy());
    expect(screen.queryByText('Recomendada')).toBeNull();
  });

  it('falha ao carregar módulo é apresentada como erro, nunca como lista vazia', async () => {
    getModuleById.mockRejectedValueOnce(new Error('permission denied for table learning_modules'));

    await act(async () => {
      render(
        <Suspense fallback={null}>
          <ModuloDetalhePage params={Promise.resolve({ courseId: COURSE_ID, moduleId: MODULE_ID })} />
        </Suspense>
      );
    });

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.queryByText('Nenhuma lição cadastrada ainda.')).toBeNull();
  });
});

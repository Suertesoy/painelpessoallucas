// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Suspense } from 'react';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import LicaoDetalhePage from '@/app/aprendizado/[courseId]/modulos/[moduleId]/licoes/[lessonId]/page';

/**
 * Cobre o item 6 (falhas e casos de borda) para a página de detalhe da
 * lição: carregamento, lição inexistente, combinação incorreta entre
 * curso/módulo/lição, e isolamento de workspace (RLS retornando null é
 * tratado como "não encontrado", nunca como dado vazando).
 */

const fakeRepo = { subscribe: () => () => {} };
const COURSE_ID = '44444444-4444-4444-8444-444444444444';
const MODULE_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_MODULE_ID = '33333333-3333-4333-8333-333333333399';
const LESSON_ID = '11111111-1111-4111-8111-111111111111';

const baseModule = {
  id: MODULE_ID,
  workspaceId: 'ws-1',
  courseId: COURSE_ID,
  title: 'Fundamentos',
  position: 0,
  status: 'available' as const,
  lessonsCount: 1,
  createdAt: '2026-07-29T10:00:00.000Z',
  updatedAt: '2026-07-29T10:00:00.000Z',
};

const baseLesson = {
  id: LESSON_ID,
  workspaceId: 'ws-1',
  moduleId: MODULE_ID,
  contentKey: 'introducao-ao-curso',
  title: 'Introdução ao curso',
  position: 0,
  content: {
    blocks: [
      { id: 'obj', type: 'objective' as const, text: 'Objetivo da lição.' },
      { id: 'sum', type: 'summary' as const, points: ['Ponto final.'] },
    ],
  },
  createdAt: '2026-07-29T10:00:00.000Z',
  updatedAt: '2026-07-29T10:00:00.000Z',
};

const getModuleById = vi.fn();
const getLessonById = vi.fn();
const getLessonProgress = vi.fn();
const recordLessonViewed = vi.fn().mockResolvedValue(undefined);
const recordExerciseResult = vi.fn().mockResolvedValue(undefined);
const completeLesson = vi.fn().mockResolvedValue(undefined);

vi.mock('@/providers/repository.provider', () => ({
  useRepositories: () => ({
    itemRepository: fakeRepo,
    projectRepository: fakeRepo,
    dailyPlanRepository: fakeRepo,
    calendarEventLinkRepository: fakeRepo,
    learningContentRepository: fakeRepo,
    studySessionRepository: fakeRepo,
    lessonProgressRepository: fakeRepo,
  }),
  useQueries: () => ({
    learning: { getModuleById, getLessonById, getLessonProgress },
  }),
  useCommands: () => ({
    learning: { recordLessonViewed, recordExerciseResult, completeLesson },
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function renderPage(params: { courseId: string; moduleId: string; lessonId: string }) {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <LicaoDetalhePage params={Promise.resolve(params)} />
      </Suspense>
    );
  });
}

describe('LicaoDetalhePage — carregamento e renderização', () => {
  it('renderiza a lição quando módulo, lição e progresso são consistentes', async () => {
    getModuleById.mockResolvedValue(baseModule);
    getLessonById.mockResolvedValue(baseLesson);
    getLessonProgress.mockResolvedValue(null);

    await renderPage({ courseId: COURSE_ID, moduleId: MODULE_ID, lessonId: LESSON_ID });

    await waitFor(() => expect(screen.getByText('Introdução ao curso')).toBeTruthy());
    expect(screen.getByText('Objetivo da lição.')).toBeTruthy();
    expect(recordLessonViewed).toHaveBeenCalledWith('ws-1', {
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      lessonId: LESSON_ID,
    });
  });
});

describe('LicaoDetalhePage — lição inexistente ou combinação incorreta', () => {
  it('lição inexistente mostra "Lição não encontrada"', async () => {
    getModuleById.mockResolvedValue(baseModule);
    getLessonById.mockResolvedValue(null);
    getLessonProgress.mockResolvedValue(null);

    await renderPage({ courseId: COURSE_ID, moduleId: MODULE_ID, lessonId: LESSON_ID });

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('Lição não encontrada.')).toBeTruthy();
  });

  it('lição pertencente a outro módulo é tratada como não encontrada (nunca renderizada)', async () => {
    getModuleById.mockResolvedValue({ ...baseModule, id: OTHER_MODULE_ID });
    getLessonById.mockResolvedValue(baseLesson); // baseLesson.moduleId === MODULE_ID, não OTHER_MODULE_ID
    getLessonProgress.mockResolvedValue(null);

    await renderPage({ courseId: COURSE_ID, moduleId: OTHER_MODULE_ID, lessonId: LESSON_ID });

    await waitFor(() => expect(screen.getByText('Lição não encontrada.')).toBeTruthy());
    expect(screen.queryByText('Objetivo da lição.')).toBeNull();
  });

  it('módulo pertencente a outro curso é tratado como não encontrado', async () => {
    getModuleById.mockResolvedValue(baseModule); // baseModule.courseId === COURSE_ID
    getLessonById.mockResolvedValue(baseLesson);
    getLessonProgress.mockResolvedValue(null);

    await renderPage({ courseId: 'outro-curso-id', moduleId: MODULE_ID, lessonId: LESSON_ID });

    await waitFor(() => expect(screen.getByText('Lição não encontrada.')).toBeTruthy());
  });

  it('isolamento entre workspaces: repositório filtrado por RLS retorna null, tratado como não encontrado (nunca vaza dado)', async () => {
    // Equivalente a uma lição de outro workspace: RLS já filtra, a query nunca a retorna.
    getModuleById.mockResolvedValue(null);
    getLessonById.mockResolvedValue(null);
    getLessonProgress.mockResolvedValue(null);

    await renderPage({ courseId: COURSE_ID, moduleId: MODULE_ID, lessonId: LESSON_ID });

    await waitFor(() => expect(screen.getByText('Lição não encontrada.')).toBeTruthy());
  });
});

describe('LicaoDetalhePage — falha de repositório', () => {
  it('falha ao carregar a lição é apresentada como erro, nunca como "não encontrada"', async () => {
    getModuleById.mockResolvedValue(baseModule);
    getLessonById.mockRejectedValueOnce(new Error('permission denied for table learning_lessons'));
    getLessonProgress.mockResolvedValue(null);

    await renderPage({ courseId: COURSE_ID, moduleId: MODULE_ID, lessonId: LESSON_ID });

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.queryByText('Lição não encontrada.')).toBeNull();
  });
});

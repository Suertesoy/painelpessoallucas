// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Suspense } from 'react';
import { render, screen, waitFor, cleanup, act, fireEvent } from '@testing-library/react';
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
const getCoursePreferences = vi.fn();
const listLessonsByModule = vi.fn();
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
    learning: { getModuleById, getLessonById, getLessonProgress, getCoursePreferences, listLessonsByModule },
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

const NEXT_LESSON_ID = '11111111-1111-4111-8111-111111111112';

describe('LicaoDetalhePage — navegação sequencial por posição, nunca por título', () => {
  it('após concluir, oferece link para a próxima lição pela posição', async () => {
    getModuleById.mockResolvedValue(baseModule);
    getLessonById.mockResolvedValue(baseLesson);
    getLessonProgress.mockResolvedValue(null);
    getCoursePreferences.mockResolvedValue(null);
    listLessonsByModule.mockResolvedValue([
      baseLesson,
      { ...baseLesson, id: NEXT_LESSON_ID, contentKey: 'hiragana-vogais', title: 'Zzz — vem por título depois, mas por posição antes', position: 1 },
    ]);
    completeLesson.mockResolvedValue(undefined);

    await renderPage({ courseId: COURSE_ID, moduleId: MODULE_ID, lessonId: LESSON_ID });
    await waitFor(() => expect(screen.getByText('Introdução ao curso')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Concluir lição/ }));

    await waitFor(() => expect(screen.getByRole('link', { name: /Próxima lição/ })).toBeTruthy());
    const link = screen.getByRole('link', { name: /Próxima lição/ }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(`/aprendizado/${COURSE_ID}/modulos/${MODULE_ID}/licoes/${NEXT_LESSON_ID}`);
  });

  it('na última lição do módulo, oferece "Voltar ao módulo" em vez de "Próxima lição"', async () => {
    getModuleById.mockResolvedValue(baseModule);
    getLessonById.mockResolvedValue(baseLesson);
    getLessonProgress.mockResolvedValue({
      id: 'p1',
      workspaceId: 'ws-1',
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      lessonId: LESSON_ID,
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
    });
    getCoursePreferences.mockResolvedValue(null);
    listLessonsByModule.mockResolvedValue([baseLesson]); // única lição do módulo

    await renderPage({ courseId: COURSE_ID, moduleId: MODULE_ID, lessonId: LESSON_ID });

    await waitFor(() => expect(screen.getByRole('link', { name: /Voltar ao módulo/ })).toBeTruthy());
    expect(screen.queryByRole('link', { name: /Próxima lição/ })).toBeNull();
    const link = screen.getByRole('link', { name: /Voltar ao módulo/ }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(`/aprendizado/${COURSE_ID}/modulos/${MODULE_ID}`);
  });
});

const LESSON_WITH_KANA_ID = '11111111-1111-4111-8111-111111111113';
const lessonWithKana = {
  ...baseLesson,
  id: LESSON_WITH_KANA_ID,
  contentKey: 'hiragana-vogais',
  title: 'Hiragana — Vogais',
  content: {
    blocks: [
      { id: 'obj', type: 'objective' as const, text: 'Objetivo.' },
      { id: 'kana', type: 'kana' as const, characters: [{ character: 'あ', romaji: 'a' }] },
      { id: 'sum', type: 'summary' as const, points: ['Ponto.'] },
    ],
  },
};

describe('LicaoDetalhePage — preferência de romaji do curso', () => {
  it('oculta romaji quando CoursePreferences.showRomaji é false', async () => {
    getModuleById.mockResolvedValue(baseModule);
    getLessonById.mockResolvedValue(lessonWithKana);
    getLessonProgress.mockResolvedValue(null);
    getCoursePreferences.mockResolvedValue({
      workspaceId: 'ws-1',
      courseId: COURSE_ID,
      showRomaji: false,
      showFurigana: true,
      showTranslation: true,
      autoPlayAudio: false,
      createdAt: '2026-07-29T10:00:00.000Z',
      updatedAt: '2026-07-29T10:00:00.000Z',
    });
    listLessonsByModule.mockResolvedValue([lessonWithKana]);

    await renderPage({ courseId: COURSE_ID, moduleId: MODULE_ID, lessonId: LESSON_WITH_KANA_ID });

    await waitFor(() => expect(screen.getByText('あ')).toBeTruthy());
    expect(screen.queryByText('a')).toBeNull();
  });

  it('mostra romaji quando CoursePreferences.showRomaji é true', async () => {
    getModuleById.mockResolvedValue(baseModule);
    getLessonById.mockResolvedValue(lessonWithKana);
    getLessonProgress.mockResolvedValue(null);
    getCoursePreferences.mockResolvedValue({
      workspaceId: 'ws-1',
      courseId: COURSE_ID,
      showRomaji: true,
      showFurigana: true,
      showTranslation: true,
      autoPlayAudio: false,
      createdAt: '2026-07-29T10:00:00.000Z',
      updatedAt: '2026-07-29T10:00:00.000Z',
    });
    listLessonsByModule.mockResolvedValue([lessonWithKana]);

    await renderPage({ courseId: COURSE_ID, moduleId: MODULE_ID, lessonId: LESSON_WITH_KANA_ID });

    await waitFor(() => expect(screen.getByText('あ')).toBeTruthy());
    expect(screen.getByText('a')).toBeTruthy();
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

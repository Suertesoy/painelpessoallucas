import { describe, it, expect } from 'vitest';
import { moduleHref, type LearningModule } from '@/modules/learning/domain/learning.schema';
import { LearningCommands } from '@/modules/learning/application/learning.commands';
import { LearningQueries } from '@/modules/learning/application/learning.queries';
import {
  FakeLearningContentRepository,
  FakeStudySessionRepository,
  FakeLessonProgressRepository,
  FakeEventRepository,
} from './learning-fakes';

const WORKSPACE_A = 'c5be4f82-e8c9-403f-a495-59e2d5838d50';
const WORKSPACE_B = '8d2facfc-27bf-4736-97c9-b30e70fecfb6';
const COURSE_ID = 'a00df540-da81-4195-af8e-9b0e1115bc03';

function baseModule(overrides: Partial<LearningModule> = {}): LearningModule {
  return {
    id: '74ca335a-3d5e-4297-81fe-c4bba627b51b',
    workspaceId: WORKSPACE_A,
    courseId: COURSE_ID,
    title: 'Fundamentos',
    position: 0,
    status: 'available',
    lessonsCount: 1,
    createdAt: '2026-07-28T11:00:00.000Z',
    updatedAt: '2026-07-28T11:00:00.000Z',
    ...overrides,
  };
}

describe('moduleHref — navegabilidade do módulo', () => {
  it('módulo disponível gera um link navegável', () => {
    const mod = baseModule({ status: 'available' });
    expect(moduleHref(COURSE_ID, mod)).toBe(`/aprendizado/${COURSE_ID}/modulos/${mod.id}`);
  });

  it('módulo em andamento também gera link navegável', () => {
    const mod = baseModule({ status: 'in_progress' });
    expect(moduleHref(COURSE_ID, mod)).not.toBeNull();
  });

  it('módulo concluído também gera link navegável', () => {
    const mod = baseModule({ status: 'completed' });
    expect(moduleHref(COURSE_ID, mod)).not.toBeNull();
  });

  it('módulo bloqueado não gera link (null)', () => {
    const mod = baseModule({ status: 'locked' });
    expect(moduleHref(COURSE_ID, mod)).toBeNull();
  });
});

function setup() {
  const contentRepo = new FakeLearningContentRepository();
  const sessionRepo = new FakeStudySessionRepository();
  const progressRepo = new FakeLessonProgressRepository();
  const eventRepo = new FakeEventRepository();
  const commands = new LearningCommands(contentRepo, sessionRepo, eventRepo, progressRepo);
  const queries = new LearningQueries(contentRepo, sessionRepo, progressRepo);
  return { commands, queries, contentRepo, progressRepo, eventRepo };
}

describe('Rota do módulo — curso/módulo inexistente', () => {
  it('getCourseById retorna null para curso inexistente', async () => {
    const { queries } = setup();
    expect(await queries.getCourseById('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('getModuleById retorna null para módulo inexistente', async () => {
    const { queries } = setup();
    expect(await queries.getModuleById('00000000-0000-4000-8000-000000000001')).toBeNull();
  });

  it('listLessonsByModule retorna lista vazia (estado honesto) para módulo sem lições', async () => {
    const { commands, queries, contentRepo } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const modules = await contentRepo.listModulesByCourse(course.id);
    const gramatica = modules.find((m) => m.title === 'Gramática')!;

    expect(await queries.listLessonsByModule(gramatica.id)).toEqual([]);
  });
});

describe('Isolamento entre workspaces — acesso a módulo de outro workspace', () => {
  it('módulo de um workspace não é encontrado pelo repositório de outro workspace', async () => {
    const { commands, contentRepo } = setup();
    const contentRepoB = new FakeLearningContentRepository();
    const sessionRepoB = new FakeStudySessionRepository();
    const progressRepoB = new FakeLessonProgressRepository();
    const eventRepoB = new FakeEventRepository();
    const commandsB = new LearningCommands(contentRepoB, sessionRepoB, eventRepoB, progressRepoB);
    const queriesB = new LearningQueries(contentRepoB, sessionRepoB, progressRepoB);

    const courseA = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    await commandsB.initializeDefaultLearningContent(WORKSPACE_B);

    const modulesA = await contentRepo.listModulesByCourse(courseA.id);
    const fundamentosA = modulesA.find((m) => m.title === 'Fundamentos')!;

    // O repositório do workspace B (equivalente a um cliente Supabase filtrado
    // por RLS) nunca teve esse módulo — deve retornar null, nunca vazar dados.
    expect(await queriesB.getModuleById(fundamentosA.id)).toBeNull();
  });
});

async function seedFundamentosLessons(commands: LearningCommands, contentRepo: FakeLearningContentRepository, workspaceId: string) {
  const course = await commands.initializeDefaultLearningContent(workspaceId);
  const modules = await contentRepo.listModulesByCourse(course.id);
  const fundamentos = modules.find((m) => m.title === 'Fundamentos')!;
  const lessons = await contentRepo.listLessonsByModule(fundamentos.id);
  const introducao = lessons.find((l) => l.contentKey === 'introducao-ao-curso')!;
  const hiragana = lessons.find((l) => l.contentKey === 'hiragana-vogais')!;
  return { course, fundamentos, introducao, hiragana };
}

describe('LearningCommands — progresso de lição', () => {
  it('recordLessonViewed cria o progresso (in_progress) e é idempotente em chamadas repetidas', async () => {
    const { commands, queries, contentRepo } = setup();
    const { course, fundamentos, introducao } = await seedFundamentosLessons(commands, contentRepo, WORKSPACE_A);

    const first = await commands.recordLessonViewed(WORKSPACE_A, {
      courseId: course.id,
      moduleId: fundamentos.id,
      lessonId: introducao.id,
    });
    expect(first.status).toBe('in_progress');
    expect(first.answeredCount).toBe(0);

    const second = await commands.recordLessonViewed(WORKSPACE_A, {
      courseId: course.id,
      moduleId: fundamentos.id,
      lessonId: introducao.id,
    });
    expect(second.id).toBe(first.id);
    expect(second.status).toBe('in_progress');
    expect(second.startedAt).toBe(first.startedAt);

    const stored = await queries.getLessonProgress(WORKSPACE_A, introducao.id);
    expect(stored?.id).toBe(first.id);
  });

  it('lição sem exercícios NÃO fica concluída automaticamente ao ser vista', async () => {
    const { commands, queries, contentRepo } = setup();
    const { course, fundamentos } = await seedFundamentosLessons(commands, contentRepo, WORKSPACE_A);

    // Lição sintética sem blocos de exercício, para validar o caso "0 exercícios".
    const noExerciseLesson = {
      id: '99999999-9999-4999-8999-999999999999',
      workspaceId: WORKSPACE_A,
      moduleId: fundamentos.id,
      contentKey: 'sem-exercicios',
      title: 'Lição sem exercícios',
      position: 99,
      content: {
        blocks: [
          { id: 'obj', type: 'objective' as const, text: 'Objetivo' },
          { id: 'sum', type: 'summary' as const, points: ['Ponto'] },
        ],
      },
      createdAt: '2026-07-29T10:00:00.000Z',
      updatedAt: '2026-07-29T10:00:00.000Z',
    };
    await contentRepo.saveLessons([noExerciseLesson]);

    const progress = await commands.recordLessonViewed(WORKSPACE_A, {
      courseId: course.id,
      moduleId: fundamentos.id,
      lessonId: noExerciseLesson.id,
    });
    expect(progress.totalExercises).toBe(0);
    expect(progress.status).toBe('in_progress');
    expect(progress.completedAt).toBeUndefined();

    // Só a ação explícita conclui — mesmo sem nenhum exercício a fazer.
    const completed = await commands.completeLesson(WORKSPACE_A, {
      courseId: course.id,
      moduleId: fundamentos.id,
      lessonId: noExerciseLesson.id,
    });
    expect(completed.status).toBe('completed');

    const stored = await queries.getLessonProgress(WORKSPACE_A, noExerciseLesson.id);
    expect(stored?.status).toBe('completed');
  });

  it('responder todos os blocos de exercício NÃO conclui a lição sozinho — só a ação explícita conclui', async () => {
    const { commands, contentRepo } = setup();
    const { course, fundamentos, hiragana } = await seedFundamentosLessons(commands, contentRepo, WORKSPACE_A);
    const exerciseBlockIds = hiragana.content.blocks
      .filter((b) => b.type === 'multiple_choice' || b.type === 'matching')
      .map((b) => b.id);
    expect(exerciseBlockIds.length).toBe(2);

    await commands.recordExerciseResult(WORKSPACE_A, {
      courseId: course.id,
      moduleId: fundamentos.id,
      lessonId: hiragana.id,
      blockId: exerciseBlockIds[0],
      outcome: 'correct',
    });
    const afterSecond = await commands.recordExerciseResult(WORKSPACE_A, {
      courseId: course.id,
      moduleId: fundamentos.id,
      lessonId: hiragana.id,
      blockId: exerciseBlockIds[1],
      outcome: 'correct',
    });

    expect(afterSecond.answeredCount).toBe(2);
    expect(afterSecond.resolvedCount).toBe(2);
    // Todos os exercícios resolvidos, mas a lição continua em andamento.
    expect(afterSecond.status).toBe('in_progress');
    expect(afterSecond.completedAt).toBeUndefined();
  });

  it('resposta incorreta não trava o exercício: permite nova tentativa até resolver, sem inflar answeredCount', async () => {
    const { commands, contentRepo } = setup();
    const { course, fundamentos, hiragana } = await seedFundamentosLessons(commands, contentRepo, WORKSPACE_A);
    const [blockId] = hiragana.content.blocks
      .filter((b) => b.type === 'multiple_choice' || b.type === 'matching')
      .map((b) => b.id);

    const first = await commands.recordExerciseResult(WORKSPACE_A, {
      courseId: course.id,
      moduleId: fundamentos.id,
      lessonId: hiragana.id,
      blockId,
      outcome: 'incorrect',
    });
    expect(first.answeredCount).toBe(1);
    expect(first.resolvedCount).toBe(0);
    expect(first.attempts[blockId]).toMatchObject({ firstOutcome: 'incorrect', latestOutcome: 'incorrect', attemptCount: 1 });
    expect(first.attempts[blockId].resolvedAt).toBeUndefined();

    // Tenta de novo, agora acertando.
    const second = await commands.recordExerciseResult(WORKSPACE_A, {
      courseId: course.id,
      moduleId: fundamentos.id,
      lessonId: hiragana.id,
      blockId,
      outcome: 'correct',
    });
    expect(second.answeredCount).toBe(1); // não infla — mesmo blockId
    expect(second.resolvedCount).toBe(1);
    expect(second.attempts[blockId].firstOutcome).toBe('incorrect'); // imutável
    expect(second.attempts[blockId].latestOutcome).toBe('correct');
    expect(second.attempts[blockId].attemptCount).toBe(2);
    expect(second.attempts[blockId].resolvedAt).toBeDefined();
  });

  it('exercício resolvido é idempotente: uma terceira chamada não reabre nem altera o registro', async () => {
    const { commands, contentRepo } = setup();
    const { course, fundamentos, hiragana } = await seedFundamentosLessons(commands, contentRepo, WORKSPACE_A);
    const [blockId] = hiragana.content.blocks
      .filter((b) => b.type === 'multiple_choice' || b.type === 'matching')
      .map((b) => b.id);

    await commands.recordExerciseResult(WORKSPACE_A, {
      courseId: course.id,
      moduleId: fundamentos.id,
      lessonId: hiragana.id,
      blockId,
      outcome: 'correct',
    });
    const resolvedAtFirst = (await commands.recordExerciseResult(WORKSPACE_A, {
      courseId: course.id,
      moduleId: fundamentos.id,
      lessonId: hiragana.id,
      blockId,
      outcome: 'correct',
    })).attempts[blockId].resolvedAt;

    const afterThird = await commands.recordExerciseResult(WORKSPACE_A, {
      courseId: course.id,
      moduleId: fundamentos.id,
      lessonId: hiragana.id,
      blockId,
      outcome: 'incorrect',
    });
    expect(afterThird.attempts[blockId].attemptCount).toBe(1);
    expect(afterThird.attempts[blockId].latestOutcome).toBe('correct');
    expect(afterThird.attempts[blockId].resolvedAt).toBe(resolvedAtFirst);
  });

  it('completeLesson conclui mesmo com exercícios pendentes (a confirmação é responsabilidade da UI)', async () => {
    const { commands, contentRepo } = setup();
    const { course, fundamentos, hiragana } = await seedFundamentosLessons(commands, contentRepo, WORKSPACE_A);

    const completed = await commands.completeLesson(WORKSPACE_A, {
      courseId: course.id,
      moduleId: fundamentos.id,
      lessonId: hiragana.id,
    });
    expect(completed.status).toBe('completed');
    expect(completed.resolvedCount).toBe(0);
    expect(completed.completedAt).toBeDefined();
  });

  it('completeLesson é idempotente: concluir de novo não reemite evento nem muda completedAt', async () => {
    const { commands, contentRepo, eventRepo } = setup();
    const { course, fundamentos, introducao } = await seedFundamentosLessons(commands, contentRepo, WORKSPACE_A);

    const first = await commands.completeLesson(WORKSPACE_A, {
      courseId: course.id,
      moduleId: fundamentos.id,
      lessonId: introducao.id,
    });
    const second = await commands.completeLesson(WORKSPACE_A, {
      courseId: course.id,
      moduleId: fundamentos.id,
      lessonId: introducao.id,
    });
    expect(second.completedAt).toBe(first.completedAt);

    const events = await eventRepo.findByEntityId(introducao.id);
    expect(events.filter((e) => e.type === 'learning.lesson.completed')).toHaveLength(1);
  });

  it('rejeita blockId que não é um bloco de exercício desta lição', async () => {
    const { commands, contentRepo } = setup();
    const { course, fundamentos, hiragana } = await seedFundamentosLessons(commands, contentRepo, WORKSPACE_A);

    await expect(
      commands.recordExerciseResult(WORKSPACE_A, {
        courseId: course.id,
        moduleId: fundamentos.id,
        lessonId: hiragana.id,
        blockId: 'bloco-inexistente',
        outcome: 'correct',
      })
    ).rejects.toThrow(/não encontrado/);
  });

  it('rejeita acesso à lição por um módulo ou curso incompatível', async () => {
    const { commands, contentRepo } = setup();
    const { course, fundamentos, hiragana } = await seedFundamentosLessons(commands, contentRepo, WORKSPACE_A);
    const modules = await contentRepo.listModulesByCourse(course.id);
    const gramatica = modules.find((m) => m.title === 'Gramática')!;

    await expect(
      commands.recordLessonViewed(WORKSPACE_A, { courseId: course.id, moduleId: gramatica.id, lessonId: hiragana.id })
    ).rejects.toThrow(/não encontrada neste módulo/);

    await expect(
      commands.recordLessonViewed(WORKSPACE_A, {
        courseId: '00000000-0000-4000-8000-000000000099',
        moduleId: fundamentos.id,
        lessonId: hiragana.id,
      })
    ).rejects.toThrow(/não encontrado neste curso/);
  });

  it('isolamento entre workspaces: progresso de um workspace não vaza para outro', async () => {
    const { commands, contentRepo } = setup();
    const contentRepoB = new FakeLearningContentRepository();
    const sessionRepoB = new FakeStudySessionRepository();
    const progressRepoB = new FakeLessonProgressRepository();
    const eventRepoB = new FakeEventRepository();
    const commandsB = new LearningCommands(contentRepoB, sessionRepoB, eventRepoB, progressRepoB);
    const queriesB = new LearningQueries(contentRepoB, sessionRepoB, progressRepoB);

    const { course, fundamentos, introducao } = await seedFundamentosLessons(commands, contentRepo, WORKSPACE_A);
    await commandsB.initializeDefaultLearningContent(WORKSPACE_B);

    await commands.recordLessonViewed(WORKSPACE_A, { courseId: course.id, moduleId: fundamentos.id, lessonId: introducao.id });

    // Mesmo lessonId (não existe no workspace B) não deve retornar progresso.
    expect(await queriesB.getLessonProgress(WORKSPACE_B, introducao.id)).toBeNull();
  });

  it('progresso persiste entre "sessões" (uma nova instância de Queries lendo o mesmo repositório simula um refresh)', async () => {
    const { commands, contentRepo, progressRepo } = setup();
    const { course, fundamentos, hiragana } = await seedFundamentosLessons(commands, contentRepo, WORKSPACE_A);
    const [blockId] = hiragana.content.blocks
      .filter((b) => b.type === 'multiple_choice' || b.type === 'matching')
      .map((b) => b.id);

    await commands.recordExerciseResult(WORKSPACE_A, {
      courseId: course.id,
      moduleId: fundamentos.id,
      lessonId: hiragana.id,
      blockId,
      outcome: 'correct',
    });

    // Uma nova instância de Queries sobre o MESMO repositório representa a
    // consulta feita após um refresh de página — não deve perder o progresso.
    const queriesAfterRefresh = new LearningQueries(contentRepo, new FakeStudySessionRepository(), progressRepo);
    const progressAfterRefresh = await queriesAfterRefresh.getLessonProgress(WORKSPACE_A, hiragana.id);
    expect(progressAfterRefresh?.answeredCount).toBe(1);
    expect(progressAfterRefresh?.resolvedCount).toBe(1);
    expect(progressAfterRefresh?.status).toBe('in_progress');
  });

  it('recordLessonViewed não reverte nem reconclui uma lição já concluída (só atualiza lastActivityAt)', async () => {
    const { commands, contentRepo } = setup();
    const { course, fundamentos, introducao } = await seedFundamentosLessons(commands, contentRepo, WORKSPACE_A);

    const completed = await commands.completeLesson(WORKSPACE_A, {
      courseId: course.id,
      moduleId: fundamentos.id,
      lessonId: introducao.id,
    });

    const viewedAgain = await commands.recordLessonViewed(WORKSPACE_A, {
      courseId: course.id,
      moduleId: fundamentos.id,
      lessonId: introducao.id,
    });

    expect(viewedAgain.status).toBe('completed');
    expect(viewedAgain.completedAt).toBe(completed.completedAt);
  });

  it('resolver um exercício pendente após a conclusão atualiza resolvedCount sem reconcluir nem apagar o histórico', async () => {
    const { commands, contentRepo, eventRepo } = setup();
    const { course, fundamentos, hiragana } = await seedFundamentosLessons(commands, contentRepo, WORKSPACE_A);
    const exerciseBlockIds = hiragana.content.blocks
      .filter((b) => b.type === 'multiple_choice' || b.type === 'matching')
      .map((b) => b.id);

    // Resolve só um dos dois exercícios e conclui a lição com o outro pendente.
    await commands.recordExerciseResult(WORKSPACE_A, {
      courseId: course.id,
      moduleId: fundamentos.id,
      lessonId: hiragana.id,
      blockId: exerciseBlockIds[0],
      outcome: 'correct',
    });
    const completed = await commands.completeLesson(WORKSPACE_A, {
      courseId: course.id,
      moduleId: fundamentos.id,
      lessonId: hiragana.id,
    });
    expect(completed.status).toBe('completed');
    expect(completed.resolvedCount).toBe(1);

    // Resolve o exercício que ficou pendente, depois da conclusão.
    const afterResolvingPending = await commands.recordExerciseResult(WORKSPACE_A, {
      courseId: course.id,
      moduleId: fundamentos.id,
      lessonId: hiragana.id,
      blockId: exerciseBlockIds[1],
      outcome: 'correct',
    });

    expect(afterResolvingPending.status).toBe('completed');
    expect(afterResolvingPending.resolvedCount).toBe(2);
    expect(afterResolvingPending.completedAt).toBe(completed.completedAt);
    // Histórico do primeiro exercício, resolvido antes da conclusão, preservado.
    expect(afterResolvingPending.attempts[exerciseBlockIds[0]].resolvedAt).toBeDefined();

    const completedEvents = await eventRepo.findByEntityId(hiragana.id);
    expect(completedEvents.filter((e) => e.type === 'learning.lesson.completed')).toHaveLength(1);
  });
});

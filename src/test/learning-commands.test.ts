import { describe, it, expect, beforeEach } from 'vitest';
import { LearningCommands, JAPANESE_COURSE_SLUG } from '@/modules/learning/application/learning.commands';
import {
  FakeLearningContentRepository,
  FakeStudySessionRepository,
  FakeEventRepository,
} from './learning-fakes';

const WORKSPACE_A = 'c5be4f82-e8c9-403f-a495-59e2d5838d50';
const WORKSPACE_B = '8d2facfc-27bf-4736-97c9-b30e70fecfb6';

function setup() {
  const contentRepo = new FakeLearningContentRepository();
  const sessionRepo = new FakeStudySessionRepository();
  const eventRepo = new FakeEventRepository();
  const commands = new LearningCommands(contentRepo, sessionRepo, eventRepo);
  return { contentRepo, sessionRepo, eventRepo, commands };
}

describe('LearningCommands — validação da meta diária', () => {
  it('rejeita meta abaixo de 5 minutos', async () => {
    const { commands } = setup();
    await expect(
      commands.updateLearningPreferences(WORKSPACE_A, { defaultDailyGoalMinutes: 4 })
    ).rejects.toThrow(/mínima/);
  });

  it('rejeita meta acima de 180 minutos', async () => {
    const { commands } = setup();
    await expect(
      commands.updateLearningPreferences(WORKSPACE_A, { defaultDailyGoalMinutes: 181 })
    ).rejects.toThrow(/máxima/);
  });

  it('aceita e persiste uma meta diária válida', async () => {
    const { commands, contentRepo } = setup();
    const prefs = await commands.updateLearningPreferences(WORKSPACE_A, { defaultDailyGoalMinutes: 30 });
    expect(prefs.defaultDailyGoalMinutes).toBe(30);
    expect((await contentRepo.findPreferences())?.defaultDailyGoalMinutes).toBe(30);
  });
});

describe('LearningCommands — inicialização idempotente do curso Japonês', () => {
  it('cria o curso, os módulos e as preferências padrão na primeira chamada', async () => {
    const { commands, contentRepo, eventRepo } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);

    expect(course.slug).toBe(JAPANESE_COURSE_SLUG);
    expect(course.status).toBe('active');
    expect(course.dailyGoalMinutes).toBe(15);

    const modules = await contentRepo.listModulesByCourse(course.id);
    expect(modules).toHaveLength(5);
    expect(modules.map((m) => m.title)).toEqual([
      'Fundamentos',
      'Gramática',
      'Vocabulário',
      'Kanji',
      'Leitura',
    ]);
    expect(modules[0].status).toBe('available');
    expect(modules.slice(1).every((m) => m.status === 'locked')).toBe(true);

    const prefs = await contentRepo.findPreferences();
    expect(prefs?.defaultDailyGoalMinutes).toBe(15);

    const coursePrefs = await contentRepo.findCoursePreferences(course.id);
    expect(coursePrefs).toMatchObject({
      showRomaji: true,
      showFurigana: true,
      showTranslation: true,
      autoPlayAudio: false,
    });

    const events = await eventRepo.findAll();
    expect(events.filter((e) => e.type === 'learning.course.initialized')).toHaveLength(1);
  });

  it('não duplica curso, módulos nem evento em chamadas repetidas', async () => {
    const { commands, contentRepo, eventRepo } = setup();
    const first = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const second = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const third = await commands.initializeDefaultLearningContent(WORKSPACE_A);

    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);
    expect(await contentRepo.listCourses()).toHaveLength(1);
    expect(await contentRepo.listModulesByCourse(first.id)).toHaveLength(5);

    const events = await eventRepo.findAll();
    expect(events.filter((e) => e.type === 'learning.course.initialized')).toHaveLength(1);
  });

  it('não sobrescreve preferências já alteradas pelo usuário ao rodar novamente', async () => {
    const { commands, contentRepo } = setup();
    await commands.initializeDefaultLearningContent(WORKSPACE_A);
    await commands.updateLearningPreferences(WORKSPACE_A, { defaultDailyGoalMinutes: 45 });

    await commands.initializeDefaultLearningContent(WORKSPACE_A);

    const prefs = await contentRepo.findPreferences();
    expect(prefs?.defaultDailyGoalMinutes).toBe(45);
  });
});

describe('LearningCommands — sessões de estudo', () => {
  it('inicia uma sessão vinculada ao curso e à meta diária vigente', async () => {
    const { commands } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const session = await commands.startStudySession(WORKSPACE_A, course.id);

    expect(session.status).toBe('in_progress');
    expect(session.courseId).toBe(course.id);
    expect(session.dailyGoalMinutesSnapshot).toBe(15);
  });

  it('impede duas sessões simultâneas no mesmo workspace', async () => {
    const { commands } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    await commands.startStudySession(WORKSPACE_A, course.id);

    await expect(commands.startStudySession(WORKSPACE_A, course.id)).rejects.toThrow(
      /em andamento/
    );
  });

  it('permite sessão simultânea em workspaces diferentes (isolamento)', async () => {
    const { commands, sessionRepo } = setup();
    const contentRepoB = new FakeLearningContentRepository();
    const sessionRepoB = new FakeStudySessionRepository();
    const eventRepoB = new FakeEventRepository();
    const commandsB = new LearningCommands(contentRepoB, sessionRepoB, eventRepoB);

    const courseA = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const courseB = await commandsB.initializeDefaultLearningContent(WORKSPACE_B);

    const sessionA = await commands.startStudySession(WORKSPACE_A, courseA.id);
    const sessionB = await commandsB.startStudySession(WORKSPACE_B, courseB.id);

    expect(sessionA.workspaceId).toBe(WORKSPACE_A);
    expect(sessionB.workspaceId).toBe(WORKSPACE_B);
    expect(await sessionRepo.findActive()).not.toBeNull();
    expect(await sessionRepoB.findActive()).not.toBeNull();
  });

  it('emite o evento learning.session.started ao iniciar', async () => {
    const { commands, eventRepo } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const session = await commands.startStudySession(WORKSPACE_A, course.id);

    const events = await eventRepo.findByEntityId(session.id);
    expect(events.some((e) => e.type === 'learning.session.started')).toBe(true);
  });

  it('conclui uma sessão com a duração confirmada e emite o evento correspondente', async () => {
    const { commands, eventRepo } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const session = await commands.startStudySession(WORKSPACE_A, course.id);

    const completed = await commands.completeStudySession(session.id, { durationMinutes: 20 });

    expect(completed.status).toBe('completed');
    expect(completed.durationMinutes).toBe(20);
    expect(completed.endedAt).toBeDefined();

    const events = await eventRepo.findByEntityId(session.id);
    const completedEvent = events.find((e) => e.type === 'learning.session.completed');
    expect(completedEvent?.payload).toMatchObject({ durationMinutes: 20, goalMet: true });
  });

  it('rejeita concluir uma sessão que não está em andamento', async () => {
    const { commands } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const session = await commands.startStudySession(WORKSPACE_A, course.id);
    await commands.completeStudySession(session.id, { durationMinutes: 10 });

    await expect(commands.completeStudySession(session.id, { durationMinutes: 5 })).rejects.toThrow(
      /em andamento/
    );
  });

  it('libera nova sessão após concluir a anterior', async () => {
    const { commands } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const first = await commands.startStudySession(WORKSPACE_A, course.id);
    await commands.completeStudySession(first.id, { durationMinutes: 15 });

    const second = await commands.startStudySession(WORKSPACE_A, course.id);
    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe('in_progress');
  });

  it('cancela uma sessão em andamento e emite o evento correspondente', async () => {
    const { commands, sessionRepo, eventRepo } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const session = await commands.startStudySession(WORKSPACE_A, course.id);

    const cancelled = await commands.cancelStudySession(session.id);
    expect(cancelled.status).toBe('cancelled');
    expect(await sessionRepo.findActive()).toBeNull();

    const events = await eventRepo.findByEntityId(session.id);
    expect(events.some((e) => e.type === 'learning.session.cancelled')).toBe(true);
  });

  it('rejeita duração de conclusão fora do intervalo válido', async () => {
    const { commands } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const session = await commands.startStudySession(WORKSPACE_A, course.id);

    await expect(commands.completeStudySession(session.id, { durationMinutes: 0 })).rejects.toThrow();
    await expect(commands.completeStudySession(session.id, { durationMinutes: 601 })).rejects.toThrow();
  });
});

describe('LearningCommands — preferências específicas do curso', () => {
  let commands: LearningCommands;
  let contentRepo: FakeLearningContentRepository;
  let courseId: string;

  beforeEach(async () => {
    const s = setup();
    commands = s.commands;
    contentRepo = s.contentRepo;
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    courseId = course.id;
  });

  it('persiste a preferência de romaji', async () => {
    await commands.updateCoursePreferences(WORKSPACE_A, courseId, { showRomaji: false });
    expect((await contentRepo.findCoursePreferences(courseId))?.showRomaji).toBe(false);
  });

  it('persiste a preferência de furigana', async () => {
    await commands.updateCoursePreferences(WORKSPACE_A, courseId, { showFurigana: false });
    expect((await contentRepo.findCoursePreferences(courseId))?.showFurigana).toBe(false);
  });

  it('persiste a preferência de tradução', async () => {
    await commands.updateCoursePreferences(WORKSPACE_A, courseId, { showTranslation: false });
    expect((await contentRepo.findCoursePreferences(courseId))?.showTranslation).toBe(false);
  });

  it('persiste a preferência de reprodução automática (sem disparar áudio)', async () => {
    await commands.updateCoursePreferences(WORKSPACE_A, courseId, { autoPlayAudio: true });
    expect((await contentRepo.findCoursePreferences(courseId))?.autoPlayAudio).toBe(true);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { LearningCommands, JAPANESE_COURSE_SLUG } from '@/modules/learning/application/learning.commands';
import {
  FakeLearningContentRepository,
  FakeStudySessionRepository,
  FakeLessonProgressRepository,
  FakeEventRepository,
} from './learning-fakes';

const WORKSPACE_A = 'c5be4f82-e8c9-403f-a495-59e2d5838d50';
const WORKSPACE_B = '8d2facfc-27bf-4736-97c9-b30e70fecfb6';

function setup() {
  const contentRepo = new FakeLearningContentRepository();
  const sessionRepo = new FakeStudySessionRepository();
  const progressRepo = new FakeLessonProgressRepository();
  const eventRepo = new FakeEventRepository();
  const commands = new LearningCommands(contentRepo, sessionRepo, eventRepo, progressRepo);
  return { contentRepo, sessionRepo, progressRepo, eventRepo, commands };
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
    const progressRepoB = new FakeLessonProgressRepository();
    const eventRepoB = new FakeEventRepository();
    const commandsB = new LearningCommands(contentRepoB, sessionRepoB, eventRepoB, progressRepoB);

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

describe('LearningCommands — meta diária vigente na sessão', () => {
  it('meta configurada em 20 minutos é usada como snapshot de uma sessão iniciada depois', async () => {
    const { commands } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    await commands.updateLearningPreferences(WORKSPACE_A, { defaultDailyGoalMinutes: 20 });

    const session = await commands.startStudySession(WORKSPACE_A, course.id);
    expect(session.dailyGoalMinutesSnapshot).toBe(20);
  });

  it('sessão já iniciada preserva seu dailyGoalMinutesSnapshot mesmo após a meta mudar', async () => {
    const { commands, sessionRepo } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const session = await commands.startStudySession(WORKSPACE_A, course.id);
    expect(session.dailyGoalMinutesSnapshot).toBe(15);

    await commands.updateLearningPreferences(WORKSPACE_A, { defaultDailyGoalMinutes: 20 });

    const stillInProgress = await sessionRepo.findById(session.id);
    expect(stillInProgress?.dailyGoalMinutesSnapshot).toBe(15);

    const completed = await commands.completeStudySession(session.id, { durationMinutes: 15 });
    expect(completed.dailyGoalMinutesSnapshot).toBe(15);

    const nextSession = await commands.startStudySession(WORKSPACE_A, course.id);
    expect(nextSession.dailyGoalMinutesSnapshot).toBe(20);
  });
});

describe('LearningCommands — módulos e lições reais', () => {
  it('cria as lições reais de Fundamentos, com conteúdo em blocos válido, e o contador reflete as entidades existentes', async () => {
    const { commands, contentRepo } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const modules = await contentRepo.listModulesByCourse(course.id);
    const fundamentos = modules.find((m) => m.title === 'Fundamentos')!;

    const lessons = await contentRepo.listLessonsByModule(fundamentos.id);
    expect(lessons).toHaveLength(fundamentos.lessonsCount);
    expect(lessons).toHaveLength(21);
    expect(lessons.slice(0, 2).map((l) => l.title)).toEqual(['Introdução ao curso', 'Hiragana — Vogais']);
    for (const lesson of lessons) {
      expect(lesson.content.blocks.length).toBeGreaterThan(0);
      expect(lesson.content.blocks[0].type).toBe('objective');
      expect(lesson.content.blocks[lesson.content.blocks.length - 1].type).toBe('summary');
    }
  });

  it('repara o conteúdo de uma lição existente cujo content ficou em estado inválido (reparo idempotente)', async () => {
    const { commands, contentRepo } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const modules = await contentRepo.listModulesByCourse(course.id);
    const fundamentos = modules.find((m) => m.title === 'Fundamentos')!;
    const lessons = await contentRepo.listLessonsByModule(fundamentos.id);
    const intro = lessons.find((l) => l.title === 'Introdução ao curso')!;

    // Simula uma lição criada antes do Content Engine existir (sem blocos).
    await contentRepo.saveLessons([{ ...intro, content: { blocks: [] } as unknown as typeof intro.content }]);

    await commands.initializeDefaultLearningContent(WORKSPACE_A);

    const repaired = (await contentRepo.listLessonsByModule(fundamentos.id)).find((l) => l.id === intro.id)!;
    expect(repaired.content.blocks.length).toBeGreaterThan(0);
    expect(repaired.content.blocks[0].type).toBe('objective');
  });

  it('módulos bloqueados não têm lições e o contador reflete essa ausência (0, não fictício)', async () => {
    const { commands, contentRepo } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const modules = await contentRepo.listModulesByCourse(course.id);

    for (const mod of modules.filter((m) => m.title !== 'Fundamentos')) {
      const lessons = await contentRepo.listLessonsByModule(mod.id);
      expect(mod.lessonsCount).toBe(0);
      expect(lessons).toHaveLength(0);
    }
  });

  it('repara o contador de lições quando ele está fora de sincronia com a realidade (reparo idempotente)', async () => {
    const { commands, contentRepo } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const modules = await contentRepo.listModulesByCourse(course.id);
    const fundamentos = modules.find((m) => m.title === 'Fundamentos')!;

    // Reproduz o bug relatado: contador anunciando lições que não batem com a
    // quantidade real de entidades já existentes.
    await contentRepo.saveModules([{ ...fundamentos, lessonsCount: 99 }]);
    expect(
      (await contentRepo.listModulesByCourse(course.id)).find((m) => m.id === fundamentos.id)?.lessonsCount
    ).toBe(99);

    await commands.initializeDefaultLearningContent(WORKSPACE_A);

    const repaired = (await contentRepo.listModulesByCourse(course.id)).find((m) => m.id === fundamentos.id)!;
    expect(repaired.lessonsCount).toBe(21);
    expect(await contentRepo.listLessonsByModule(fundamentos.id)).toHaveLength(21);
  });
});

describe('LearningCommands — identidade estável da lição (contentKey, não título)', () => {
  it('executar o seed repetidamente não duplica lições', async () => {
    const { commands, contentRepo } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const modules = await contentRepo.listModulesByCourse(course.id);
    const fundamentos = modules.find((m) => m.title === 'Fundamentos')!;

    await commands.initializeDefaultLearningContent(WORKSPACE_A);
    await commands.initializeDefaultLearningContent(WORKSPACE_A);

    expect(await contentRepo.listLessonsByModule(fundamentos.id)).toHaveLength(21);
  });

  it('renomear o título de uma lição não cria uma lição nova nem perde o id', async () => {
    const { commands, contentRepo } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const modules = await contentRepo.listModulesByCourse(course.id);
    const fundamentos = modules.find((m) => m.title === 'Fundamentos')!;
    const lessons = await contentRepo.listLessonsByModule(fundamentos.id);
    const intro = lessons.find((l) => l.contentKey === 'introducao-ao-curso')!;

    // Simula uma edição editorial do título feita fora do seed (ex.: futura
    // tela de edição) — o contentKey permanece o mesmo.
    await contentRepo.saveLessons([{ ...intro, title: 'Título editado manualmente' }]);

    await commands.initializeDefaultLearningContent(WORKSPACE_A);

    const afterSeed = await contentRepo.listLessonsByModule(fundamentos.id);
    expect(afterSeed).toHaveLength(21);
    const reconciled = afterSeed.find((l) => l.contentKey === 'introducao-ao-curso')!;
    // O seed é a fonte de verdade para o título — reescreve de volta, mas o
    // id (identidade real da linha, é o que progresso referencia) não muda.
    expect(reconciled.id).toBe(intro.id);
    expect(reconciled.title).toBe('Introdução ao curso');
  });

  it('atualizar o conteúdo de uma lição existente preserva o id', async () => {
    const { commands, contentRepo } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const modules = await contentRepo.listModulesByCourse(course.id);
    const fundamentos = modules.find((m) => m.title === 'Fundamentos')!;
    const lessons = await contentRepo.listLessonsByModule(fundamentos.id);
    const intro = lessons.find((l) => l.contentKey === 'introducao-ao-curso')!;

    await contentRepo.saveLessons([{ ...intro, content: { blocks: [] } as unknown as typeof intro.content }]);
    await commands.initializeDefaultLearningContent(WORKSPACE_A);

    const repaired = (await contentRepo.listLessonsByModule(fundamentos.id)).find((l) => l.contentKey === 'introducao-ao-curso')!;
    expect(repaired.id).toBe(intro.id);
    expect(repaired.content.blocks.length).toBeGreaterThan(0);
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

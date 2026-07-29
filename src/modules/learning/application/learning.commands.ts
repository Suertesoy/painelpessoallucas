import { EventRepository } from '@/platform/events/event.repository';
import { LearningContentRepository } from './learning-content.repository';
import { StudySessionRepository } from './study-session.repository';
import { LessonProgressRepository } from './lesson-progress.repository';
import {
  Course,
  CourseSchema,
  LearningModule,
  LearningModuleSchema,
  Lesson,
  LessonSchema,
  LearningPreferences,
  LearningPreferencesSchema,
  CoursePreferences,
  CoursePreferencesSchema,
  StudySession,
  StudySessionSchema,
  UpdateLearningPreferencesDTO,
  UpdateLearningPreferencesSchema,
  UpdateCoursePreferencesDTO,
  UpdateCoursePreferencesSchema,
  CompleteStudySessionDTO,
  CompleteStudySessionSchema,
  isDailyGoalMet,
} from '../domain/learning.schema';
import { EXERCISE_BLOCK_TYPES, type LessonContent } from '../domain/lesson-content.schema';
import {
  ExerciseAttempt,
  LessonProgress,
  LessonProgressSchema,
  RecordExerciseResultDTO,
  RecordExerciseResultSchema,
} from '../domain/lesson-progress.schema';
import introducaoAoCursoContent from '../content/introducao-ao-curso';
import hiraganaVogaisContent from '../content/hiragana-vogais';

/** Primeiro curso cadastrado — Japonês. Não é um caso especial no código: é
 * apenas o registro inicial do Learning Engine genérico. */
export const JAPANESE_COURSE_SLUG = 'japones';
const DEFAULT_DAILY_GOAL_MINUTES = 15;

interface DefaultLessonSeed {
  /** Identidade estável usada para reconciliar — nunca o título (editorial,
   * pode mudar sem criar uma lição nova nem perder o progresso associado). */
  contentKey: string;
  title: string;
  description?: string;
  content: LessonContent;
}

interface DefaultModuleSeed {
  title: string;
  description: string;
  status: 'available' | 'locked';
  /** Lições reais criadas junto com o módulo — nunca um contador artificial. */
  lessons: DefaultLessonSeed[];
}

const DEFAULT_MODULES: DefaultModuleSeed[] = [
  {
    title: 'Fundamentos',
    description: 'Hiragana, katakana e as bases da pronúncia e estrutura do japonês.',
    status: 'available',
    lessons: [
      {
        contentKey: 'introducao-ao-curso',
        title: 'Introdução ao curso',
        description:
          'Objetivo do curso, estrutura dos módulos, a meta diária (ajustável em Configurações), como as revisões vão funcionar nas próximas fases e o uso de romaji e furigana como apoio de leitura.',
        content: introducaoAoCursoContent,
      },
      {
        contentKey: 'hiragana-vogais',
        title: 'Hiragana — Vogais',
        description: 'As cinco vogais do hiragana (あ・い・う・え・お): leitura, exemplos e prática.',
        content: hiraganaVogaisContent,
      },
    ],
  },
  { title: 'Gramática', description: 'Estruturas frequentes de frase.', status: 'locked', lessons: [] },
  { title: 'Vocabulário', description: 'Palavras e expressões de uso frequente.', status: 'locked', lessons: [] },
  { title: 'Kanji', description: 'Caracteres e leituras mais comuns.', status: 'locked', lessons: [] },
  { title: 'Leitura', description: 'Compreensão de textos e falas reais.', status: 'locked', lessons: [] },
];

export class LearningCommands {
  constructor(
    private contentRepo: LearningContentRepository,
    private sessionRepo: StudySessionRepository,
    private eventRepo: EventRepository,
    private progressRepo: LessonProgressRepository
  ) {}

  /**
   * Cadastra o curso Japonês, seus módulos e as preferências padrão do
   * workspace, caso ainda não existam. Idempotente: chamadas repetidas não
   * duplicam dados nem reemitem o evento de inicialização.
   */
  async initializeDefaultLearningContent(workspaceId: string): Promise<Course> {
    const existing = await this.contentRepo.findCourseBySlug(JAPANESE_COURSE_SLUG);
    const now = new Date().toISOString();

    let course = existing;
    if (!course) {
      course = {
        id: crypto.randomUUID(),
        workspaceId,
        slug: JAPANESE_COURSE_SLUG,
        title: 'Japonês',
        description:
          'Aprender a reconhecer, ler e compreender japonês em conteúdos reais, com foco inicial em fundamentos, vocabulário e estruturas frequentes.',
        status: 'active',
        dailyGoalMinutes: DEFAULT_DAILY_GOAL_MINUTES,
        createdAt: now,
        updatedAt: now,
      };
      CourseSchema.parse(course);
      await this.contentRepo.saveCourse(course);
    }

    // Roda tanto na criação quanto em chamadas repetidas: cria módulos/lições
    // que ainda não existem e corrige o contador de lições que estiver fora
    // de sincronia com as lições reais (reparo idempotente, sem duplicar).
    await this.ensureModulesAndLessons(workspaceId, course.id);
    await this.ensurePreferences(workspaceId, course.id);

    if (!existing) {
      await this.eventRepo.save({
        id: crypto.randomUUID(),
        type: 'learning.course.initialized',
        entityId: course.id,
        workspaceId,
        source: 'manual',
        payload: { slug: course.slug, title: course.title, moduleCount: DEFAULT_MODULES.length },
        createdAt: now,
      });
    }

    return course;
  }

  /**
   * Garante que os módulos padrão existam e que suas lições reais estejam
   * criadas, corrigindo `lessonsCount` para sempre refletir a contagem real
   * (nunca um valor anunciado sem entidade correspondente).
   */
  private async ensureModulesAndLessons(workspaceId: string, courseId: string): Promise<void> {
    const now = new Date().toISOString();
    const existingModules = await this.contentRepo.listModulesByCourse(courseId);
    const modulesToSave: LearningModule[] = [];
    const lessonsToSave: Lesson[] = [];

    for (let index = 0; index < DEFAULT_MODULES.length; index++) {
      const def = DEFAULT_MODULES[index];
      const found = existingModules.find((m) => m.title === def.title);
      let mod: LearningModule =
        found ??
        {
          id: crypto.randomUUID(),
          workspaceId,
          courseId,
          title: def.title,
          description: def.description,
          position: index,
          status: def.status,
          lessonsCount: def.lessons.length,
          createdAt: now,
          updatedAt: now,
        };
      const isNewModule = !found;

      // Lições são reconciliadas por `contentKey` — nunca por título, que é
      // editorial e pode mudar sem criar uma lição nova nem perder o `id`
      // (e o progresso associado a ele). O seed é a fonte de verdade para
      // título/descrição/posição/conteúdo: qualquer divergência é reparada
      // idempotentemente, não só conteúdo estruturalmente inválido.
      const existingLessons = await this.contentRepo.listLessonsByModule(mod.id);
      const newLessons: Lesson[] = [];
      def.lessons.forEach((lessonDef, lessonIndex) => {
        const existingLesson = existingLessons.find((l) => l.contentKey === lessonDef.contentKey);
        if (!existingLesson) {
          newLessons.push({
            id: crypto.randomUUID(),
            workspaceId,
            moduleId: mod.id,
            contentKey: lessonDef.contentKey,
            title: lessonDef.title,
            description: lessonDef.description,
            position: lessonIndex,
            content: lessonDef.content,
            createdAt: now,
            updatedAt: now,
          });
          return;
        }

        const isDrifted =
          existingLesson.title !== lessonDef.title ||
          existingLesson.description !== lessonDef.description ||
          existingLesson.position !== lessonIndex ||
          JSON.stringify(existingLesson.content) !== JSON.stringify(lessonDef.content);
        if (isDrifted) {
          lessonsToSave.push({
            ...existingLesson,
            title: lessonDef.title,
            description: lessonDef.description,
            position: lessonIndex,
            content: lessonDef.content,
            updatedAt: now,
          });
        }
      });
      lessonsToSave.push(...newLessons);
      const realLessonCount = existingLessons.length + newLessons.length;

      if (isNewModule || mod.lessonsCount !== realLessonCount) {
        mod = { ...mod, lessonsCount: realLessonCount, updatedAt: now };
        modulesToSave.push(mod);
      }
    }

    if (modulesToSave.length > 0) {
      modulesToSave.forEach((m) => LearningModuleSchema.parse(m));
      await this.contentRepo.saveModules(modulesToSave);
    }
    if (lessonsToSave.length > 0) {
      lessonsToSave.forEach((l) => LessonSchema.parse(l));
      await this.contentRepo.saveLessons(lessonsToSave);
    }
  }

  /** Garante preferências gerais e do curso, sem sobrescrever as existentes. */
  private async ensurePreferences(workspaceId: string, courseId: string): Promise<void> {
    const now = new Date().toISOString();

    const existingPrefs = await this.contentRepo.findPreferences();
    if (!existingPrefs) {
      const preferences: LearningPreferences = {
        workspaceId,
        defaultDailyGoalMinutes: DEFAULT_DAILY_GOAL_MINUTES,
        createdAt: now,
        updatedAt: now,
      };
      LearningPreferencesSchema.parse(preferences);
      await this.contentRepo.savePreferences(preferences);
    }

    const existingCoursePrefs = await this.contentRepo.findCoursePreferences(courseId);
    if (!existingCoursePrefs) {
      const coursePreferences: CoursePreferences = {
        workspaceId,
        courseId,
        showRomaji: true,
        showFurigana: true,
        showTranslation: true,
        autoPlayAudio: false,
        createdAt: now,
        updatedAt: now,
      };
      CoursePreferencesSchema.parse(coursePreferences);
      await this.contentRepo.saveCoursePreferences(coursePreferences);
    }
  }

  async updateLearningPreferences(
    workspaceId: string,
    dto: UpdateLearningPreferencesDTO
  ): Promise<LearningPreferences> {
    const parsed = UpdateLearningPreferencesSchema.parse(dto);
    const existing = await this.contentRepo.findPreferences();
    const now = new Date().toISOString();
    const preferences: LearningPreferences = {
      workspaceId,
      defaultDailyGoalMinutes: parsed.defaultDailyGoalMinutes,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    LearningPreferencesSchema.parse(preferences);
    await this.contentRepo.savePreferences(preferences);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'learning.preferences.updated',
      entityId: workspaceId,
      workspaceId,
      source: 'manual',
      payload: { defaultDailyGoalMinutes: preferences.defaultDailyGoalMinutes },
      createdAt: now,
    });

    return preferences;
  }

  async updateCoursePreferences(
    workspaceId: string,
    courseId: string,
    dto: UpdateCoursePreferencesDTO
  ): Promise<CoursePreferences> {
    const parsed = UpdateCoursePreferencesSchema.parse(dto);
    const existing = await this.contentRepo.findCoursePreferences(courseId);
    if (!existing) throw new Error('Preferências do curso não encontradas');

    const now = new Date().toISOString();
    const preferences: CoursePreferences = {
      ...existing,
      ...parsed,
      updatedAt: now,
    };
    CoursePreferencesSchema.parse(preferences);
    await this.contentRepo.saveCoursePreferences(preferences);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'learning.course_preferences.updated',
      entityId: courseId,
      workspaceId,
      source: 'manual',
      payload: parsed,
      createdAt: now,
    });

    return preferences;
  }

  async startStudySession(workspaceId: string, courseId: string): Promise<StudySession> {
    const active = await this.sessionRepo.findActive();
    if (active) {
      throw new Error('Já existe uma sessão de estudo em andamento. Conclua ou cancele antes de iniciar outra.');
    }

    const course = await this.contentRepo.findCourseById(courseId);
    if (!course) throw new Error('Curso não encontrado');

    const preferences = await this.contentRepo.findPreferences();
    const goalMinutes = preferences?.defaultDailyGoalMinutes ?? course.dailyGoalMinutes;

    const now = new Date().toISOString();
    const session: StudySession = {
      id: crypto.randomUUID(),
      workspaceId,
      courseId,
      startedAt: now,
      status: 'in_progress',
      source: 'session_flow',
      dailyGoalMinutesSnapshot: goalMinutes,
      createdAt: now,
      updatedAt: now,
    };
    StudySessionSchema.parse(session);
    await this.sessionRepo.save(session);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'learning.session.started',
      entityId: session.id,
      workspaceId,
      source: 'manual',
      payload: { courseId, dailyGoalMinutesSnapshot: goalMinutes },
      createdAt: now,
    });

    return session;
  }

  async completeStudySession(sessionId: string, dto: CompleteStudySessionDTO): Promise<StudySession> {
    const parsed = CompleteStudySessionSchema.parse(dto);
    const existing = await this.sessionRepo.findById(sessionId);
    if (!existing) throw new Error('Sessão de estudo não encontrada');
    if (existing.status !== 'in_progress') {
      throw new Error('Somente sessões em andamento podem ser concluídas');
    }

    const now = new Date().toISOString();
    const updated: StudySession = {
      ...existing,
      status: 'completed',
      endedAt: now,
      durationMinutes: parsed.durationMinutes,
      updatedAt: now,
    };
    StudySessionSchema.parse(updated);
    await this.sessionRepo.save(updated);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'learning.session.completed',
      entityId: updated.id,
      workspaceId: updated.workspaceId,
      source: 'manual',
      payload: {
        durationMinutes: parsed.durationMinutes,
        goalMet: isDailyGoalMet(parsed.durationMinutes, updated.dailyGoalMinutesSnapshot),
      },
      createdAt: now,
    });

    return updated;
  }

  async cancelStudySession(sessionId: string): Promise<StudySession> {
    const existing = await this.sessionRepo.findById(sessionId);
    if (!existing) throw new Error('Sessão de estudo não encontrada');
    if (existing.status !== 'in_progress' && existing.status !== 'planned') {
      throw new Error('Somente sessões planejadas ou em andamento podem ser canceladas');
    }

    const now = new Date().toISOString();
    const updated: StudySession = {
      ...existing,
      status: 'cancelled',
      endedAt: now,
      updatedAt: now,
    };
    StudySessionSchema.parse(updated);
    await this.sessionRepo.save(updated);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'learning.session.cancelled',
      entityId: updated.id,
      workspaceId: updated.workspaceId,
      source: 'manual',
      payload: {},
      createdAt: now,
    });

    return updated;
  }

  /** Blocos que produzem `ExerciseResult` ao serem respondidos — mesma
   * definição usada pelo `LessonRenderer` para o contador de progresso. */
  private countExerciseBlocks(lesson: Lesson): number {
    return lesson.content.blocks.filter((b) => (EXERCISE_BLOCK_TYPES as readonly string[]).includes(b.type)).length;
  }

  /** Valida que a lição pertence ao módulo, e o módulo ao curso — nunca
   * confia apenas no que o chamador (a página) já validou para exibição. */
  private async loadLessonForProgress(courseId: string, moduleId: string, lessonId: string): Promise<Lesson> {
    const lesson = await this.contentRepo.findLessonById(lessonId);
    if (!lesson || lesson.moduleId !== moduleId) throw new Error('Lição não encontrada neste módulo');
    const mod = await this.contentRepo.findModuleById(moduleId);
    if (!mod || mod.courseId !== courseId) throw new Error('Módulo não encontrado neste curso');
    return lesson;
  }

  /**
   * Registra a primeira visualização de uma lição, criando o progresso (a
   * ausência de linha É o estado not_started, que passa a in_progress).
   * Idempotente: chamadas repetidas só atualizam `lastActivityAt`, nunca
   * recriam a linha. NUNCA conclui a lição — mount de componente não é
   * conclusão; conclusão é sempre a ação explícita `completeLesson`, mesmo
   * para lições sem exercícios.
   */
  async recordLessonViewed(
    workspaceId: string,
    { courseId, moduleId, lessonId }: { courseId: string; moduleId: string; lessonId: string }
  ): Promise<LessonProgress> {
    const lesson = await this.loadLessonForProgress(courseId, moduleId, lessonId);
    const existing = await this.progressRepo.findByLesson(workspaceId, lessonId);
    const now = new Date().toISOString();

    if (existing) {
      const updated: LessonProgress = { ...existing, lastActivityAt: now, updatedAt: now };
      LessonProgressSchema.parse(updated);
      await this.progressRepo.save(updated);
      return updated;
    }

    const totalExercises = this.countExerciseBlocks(lesson);
    const progress: LessonProgress = {
      id: crypto.randomUUID(),
      workspaceId,
      courseId,
      moduleId,
      lessonId,
      totalExercises,
      answeredCount: 0,
      resolvedCount: 0,
      attempts: {},
      status: 'in_progress',
      startedAt: now,
      lastActivityAt: now,
      completedAt: undefined,
      createdAt: now,
      updatedAt: now,
    };
    LessonProgressSchema.parse(progress);
    await this.progressRepo.save(progress);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'learning.lesson.viewed',
      entityId: lessonId,
      workspaceId,
      source: 'manual',
      payload: { courseId, moduleId, totalExercises },
      createdAt: now,
    });

    return progress;
  }

  /**
   * Registra uma tentativa de exercício. Aprendizagem, não avaliação: uma
   * resposta incorreta não trava o exercício — ele permanece respondível
   * até ser resolvido (acertado). `firstOutcome` é imutável (preservado
   * para análise futura, ex.: uma fase de SRS); `latestOutcome` e
   * `attemptCount` acompanham cada tentativa real. Uma vez resolvido
   * (`resolvedAt` definido), novas chamadas para o mesmo `blockId` são
   * idempotentes — não reabrem o exercício nem alteram o registro.
   */
  async recordExerciseResult(
    workspaceId: string,
    params: { courseId: string; moduleId: string; lessonId: string } & RecordExerciseResultDTO
  ): Promise<LessonProgress> {
    const { courseId, moduleId, lessonId } = params;
    const parsed = RecordExerciseResultSchema.parse({ blockId: params.blockId, outcome: params.outcome });

    const lesson = await this.loadLessonForProgress(courseId, moduleId, lessonId);
    const exerciseBlockIds = new Set(
      lesson.content.blocks
        .filter((b) => (EXERCISE_BLOCK_TYPES as readonly string[]).includes(b.type))
        .map((b) => b.id)
    );
    if (!exerciseBlockIds.has(parsed.blockId)) {
      throw new Error('Bloco de exercício não encontrado nesta lição');
    }

    const existing =
      (await this.progressRepo.findByLesson(workspaceId, lessonId)) ??
      (await this.recordLessonViewed(workspaceId, { courseId, moduleId, lessonId }));

    const priorAttempt = existing.attempts[parsed.blockId];
    // Idempotente: um exercício já resolvido nunca reabre para nova tentativa.
    if (priorAttempt?.resolvedAt) {
      return existing;
    }

    const now = new Date().toISOString();
    const nextAttempt: ExerciseAttempt = priorAttempt
      ? {
          firstOutcome: priorAttempt.firstOutcome,
          latestOutcome: parsed.outcome,
          attemptCount: priorAttempt.attemptCount + 1,
          resolvedAt: parsed.outcome === 'correct' ? now : undefined,
        }
      : {
          firstOutcome: parsed.outcome,
          latestOutcome: parsed.outcome,
          attemptCount: 1,
          resolvedAt: parsed.outcome === 'correct' ? now : undefined,
        };

    const attempts = { ...existing.attempts, [parsed.blockId]: nextAttempt };
    const answeredCount = Object.keys(attempts).length;
    const resolvedCount = Object.values(attempts).filter((a) => a.resolvedAt != null).length;

    const updated: LessonProgress = {
      ...existing,
      attempts,
      answeredCount,
      resolvedCount,
      lastActivityAt: now,
      updatedAt: now,
    };
    LessonProgressSchema.parse(updated);
    await this.progressRepo.save(updated);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'learning.lesson.exercise_answered',
      entityId: lessonId,
      workspaceId,
      source: 'manual',
      payload: { blockId: parsed.blockId, outcome: parsed.outcome, attemptCount: nextAttempt.attemptCount },
      createdAt: now,
    });
    if (nextAttempt.resolvedAt && !priorAttempt?.resolvedAt) {
      await this.eventRepo.save({
        id: crypto.randomUUID(),
        type: 'learning.lesson.exercise_resolved',
        entityId: lessonId,
        workspaceId,
        source: 'manual',
        payload: { blockId: parsed.blockId, attemptCount: nextAttempt.attemptCount },
        createdAt: now,
      });
    }

    return updated;
  }

  /**
   * Conclusão consciente: sempre uma ação explícita do usuário — nunca
   * inferida do mount da lição nem de todos os exercícios estarem
   * resolvidos. Sempre permitida, mesmo com exercícios pendentes (a
   * confirmação de pendências é responsabilidade da UI, não deste Command).
   * Idempotente: concluir uma lição já concluída não reemite o evento nem
   * altera `completedAt`.
   */
  async completeLesson(
    workspaceId: string,
    { courseId, moduleId, lessonId }: { courseId: string; moduleId: string; lessonId: string }
  ): Promise<LessonProgress> {
    await this.loadLessonForProgress(courseId, moduleId, lessonId);
    const existing =
      (await this.progressRepo.findByLesson(workspaceId, lessonId)) ??
      (await this.recordLessonViewed(workspaceId, { courseId, moduleId, lessonId }));

    if (existing.status === 'completed') {
      return existing;
    }

    const now = new Date().toISOString();
    const updated: LessonProgress = {
      ...existing,
      status: 'completed',
      completedAt: now,
      lastActivityAt: now,
      updatedAt: now,
    };
    LessonProgressSchema.parse(updated);
    await this.progressRepo.save(updated);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'learning.lesson.completed',
      entityId: lessonId,
      workspaceId,
      source: 'manual',
      payload: {
        courseId,
        moduleId,
        totalExercises: existing.totalExercises,
        answeredCount: existing.answeredCount,
        resolvedCount: existing.resolvedCount,
      },
      createdAt: now,
    });

    return updated;
  }
}

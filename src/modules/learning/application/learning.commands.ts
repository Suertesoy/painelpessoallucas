import { EventRepository } from '@/platform/events/event.repository';
import { LearningContentRepository } from './learning-content.repository';
import { StudySessionRepository } from './study-session.repository';
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

/** Primeiro curso cadastrado — Japonês. Não é um caso especial no código: é
 * apenas o registro inicial do Learning Engine genérico. */
export const JAPANESE_COURSE_SLUG = 'japones';
const DEFAULT_DAILY_GOAL_MINUTES = 15;

interface DefaultModuleSeed {
  title: string;
  description: string;
  status: 'available' | 'locked';
  /** Lições reais criadas junto com o módulo — nunca um contador artificial. */
  lessons: Array<{ title: string; description?: string }>;
}

const DEFAULT_MODULES: DefaultModuleSeed[] = [
  {
    title: 'Fundamentos',
    description: 'Hiragana, katakana e as bases da pronúncia e estrutura do japonês.',
    status: 'available',
    lessons: [
      {
        title: 'Introdução ao curso',
        description:
          'Objetivo do curso, estrutura dos módulos, a meta diária (ajustável em Configurações), como as revisões vão funcionar nas próximas fases e o uso de romaji e furigana como apoio de leitura.',
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
    private eventRepo: EventRepository
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

      const existingLessons = await this.contentRepo.listLessonsByModule(mod.id);
      let realLessonCount = existingLessons.length;

      if (existingLessons.length === 0 && def.lessons.length > 0) {
        const newLessons: Lesson[] = def.lessons.map((lesson, lessonIndex) => ({
          id: crypto.randomUUID(),
          workspaceId,
          moduleId: mod.id,
          title: lesson.title,
          description: lesson.description,
          position: lessonIndex,
          createdAt: now,
          updatedAt: now,
        }));
        lessonsToSave.push(...newLessons);
        realLessonCount = newLessons.length;
      }

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
}

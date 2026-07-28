import { EventRepository } from '@/platform/events/event.repository';
import { LearningContentRepository } from './learning-content.repository';
import { StudySessionRepository } from './study-session.repository';
import {
  Course,
  CourseSchema,
  LearningModule,
  LearningModuleSchema,
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

const DEFAULT_MODULES: Array<{ title: string; description: string; status: 'available' | 'locked'; lessonsCount: number }> = [
  {
    title: 'Fundamentos',
    description: 'Hiragana, katakana e as bases da pronúncia e estrutura do japonês.',
    status: 'available',
    lessonsCount: 1,
  },
  { title: 'Gramática', description: 'Estruturas frequentes de frase.', status: 'locked', lessonsCount: 0 },
  { title: 'Vocabulário', description: 'Palavras e expressões de uso frequente.', status: 'locked', lessonsCount: 0 },
  { title: 'Kanji', description: 'Caracteres e leituras mais comuns.', status: 'locked', lessonsCount: 0 },
  { title: 'Leitura', description: 'Compreensão de textos e falas reais.', status: 'locked', lessonsCount: 0 },
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
    if (existing) {
      await this.ensurePreferences(workspaceId, existing.id);
      return existing;
    }

    const now = new Date().toISOString();
    const course: Course = {
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

    const modules: LearningModule[] = DEFAULT_MODULES.map((m, index) => ({
      id: crypto.randomUUID(),
      workspaceId,
      courseId: course.id,
      title: m.title,
      description: m.description,
      position: index,
      status: m.status,
      lessonsCount: m.lessonsCount,
      createdAt: now,
      updatedAt: now,
    }));
    modules.forEach((m) => LearningModuleSchema.parse(m));
    await this.contentRepo.saveModules(modules);

    await this.ensurePreferences(workspaceId, course.id);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'learning.course.initialized',
      entityId: course.id,
      workspaceId,
      source: 'manual',
      payload: { slug: course.slug, title: course.title, moduleCount: modules.length },
      createdAt: now,
    });

    return course;
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

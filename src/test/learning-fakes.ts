import type { LearningContentRepository } from '@/modules/learning/application/learning-content.repository';
import type { StudySessionRepository } from '@/modules/learning/application/study-session.repository';
import type { LessonProgressRepository } from '@/modules/learning/application/lesson-progress.repository';
import type { EventRepository } from '@/platform/events/event.repository';
import type {
  Course,
  LearningModule,
  Lesson,
  LearningPreferences,
  CoursePreferences,
  StudySession,
} from '@/modules/learning/domain/learning.schema';
import type { LessonProgress } from '@/modules/learning/domain/lesson-progress.schema';
import type { DomainEvent } from '@/platform/events/event.schema';

/** Repositórios em memória — mesmo papel que os adapters LocalStorage cumprem
 * para os módulos da Fase 1: permitem testar Commands/Queries sem Supabase. */
export class FakeLearningContentRepository implements LearningContentRepository {
  courses = new Map<string, Course>();
  modules = new Map<string, LearningModule>();
  lessons = new Map<string, Lesson>();
  preferences = new Map<string, LearningPreferences>();
  coursePreferences = new Map<string, CoursePreferences>();

  async findCourseBySlug(slug: string): Promise<Course | null> {
    return [...this.courses.values()].find((c) => c.slug === slug) ?? null;
  }
  async findCourseById(id: string): Promise<Course | null> {
    return this.courses.get(id) ?? null;
  }
  async listCourses(): Promise<Course[]> {
    return [...this.courses.values()];
  }
  async saveCourse(course: Course): Promise<void> {
    this.courses.set(course.id, course);
  }
  async findModuleById(id: string): Promise<LearningModule | null> {
    return this.modules.get(id) ?? null;
  }
  async listModulesByCourse(courseId: string): Promise<LearningModule[]> {
    return [...this.modules.values()]
      .filter((m) => m.courseId === courseId)
      .sort((a, b) => a.position - b.position);
  }
  async saveModules(modules: LearningModule[]): Promise<void> {
    modules.forEach((m) => this.modules.set(m.id, m));
  }
  async findLessonById(id: string): Promise<Lesson | null> {
    return this.lessons.get(id) ?? null;
  }
  async listLessonsByModule(moduleId: string): Promise<Lesson[]> {
    return [...this.lessons.values()]
      .filter((l) => l.moduleId === moduleId)
      .sort((a, b) => a.position - b.position);
  }
  async saveLessons(lessons: Lesson[]): Promise<void> {
    lessons.forEach((l) => this.lessons.set(l.id, l));
  }
  async findPreferences(): Promise<LearningPreferences | null> {
    return [...this.preferences.values()][0] ?? null;
  }
  async savePreferences(preferences: LearningPreferences): Promise<void> {
    this.preferences.set(preferences.workspaceId, preferences);
  }
  async findCoursePreferences(courseId: string): Promise<CoursePreferences | null> {
    return [...this.coursePreferences.values()].find((p) => p.courseId === courseId) ?? null;
  }
  async saveCoursePreferences(preferences: CoursePreferences): Promise<void> {
    this.coursePreferences.set(`${preferences.workspaceId}:${preferences.courseId}`, preferences);
  }
  subscribe(): () => void {
    return () => {};
  }
}

export class FakeStudySessionRepository implements StudySessionRepository {
  sessions = new Map<string, StudySession>();

  async save(session: StudySession): Promise<void> {
    this.sessions.set(session.id, session);
  }
  async findById(id: string): Promise<StudySession | null> {
    return this.sessions.get(id) ?? null;
  }
  async findActive(): Promise<StudySession | null> {
    return [...this.sessions.values()].find((s) => s.status === 'in_progress') ?? null;
  }
  async findByDateRange(startISO: string, endISO: string): Promise<StudySession[]> {
    return [...this.sessions.values()].filter(
      (s) => s.startedAt >= startISO && s.startedAt < endISO
    );
  }
  async listRecent(limit: number): Promise<StudySession[]> {
    return [...this.sessions.values()]
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      .slice(0, limit);
  }
  subscribe(): () => void {
    return () => {};
  }
}

export class FakeLessonProgressRepository implements LessonProgressRepository {
  progress = new Map<string, LessonProgress>();

  async findByLesson(workspaceId: string, lessonId: string): Promise<LessonProgress | null> {
    return (
      [...this.progress.values()].find((p) => p.workspaceId === workspaceId && p.lessonId === lessonId) ?? null
    );
  }
  async listByModule(moduleId: string): Promise<LessonProgress[]> {
    return [...this.progress.values()].filter((p) => p.moduleId === moduleId);
  }
  async save(progress: LessonProgress): Promise<void> {
    this.progress.set(progress.id, progress);
  }
  subscribe(): () => void {
    return () => {};
  }
}

export class FakeEventRepository implements EventRepository {
  events: DomainEvent[] = [];

  async save(event: DomainEvent): Promise<void> {
    this.events.push(event);
  }
  async findAll(): Promise<DomainEvent[]> {
    return this.events;
  }
  async findMigrationCompletedAt(): Promise<string | null> {
    return null;
  }
  async findByEntityId(entityId: string): Promise<DomainEvent[]> {
    return this.events.filter((e) => e.entityId === entityId);
  }
}

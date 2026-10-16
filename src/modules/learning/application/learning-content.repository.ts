import type {
  LearningViewer,
  Course,
  LearningModule,
  Lesson,
  LearningPreferences,
  CoursePreferences,
} from '../domain/learning.schema';

/**
 * Conteúdo de aprendizado: cursos, módulos, lições e preferências (gerais e
 * por curso). Agrupados num único repositório porque mudam juntos com pouca
 * frequência (seed inicial e telas de configuração) — mesmo princípio de
 * `ExecutionPlanRepository` agrupando plano/fases/ações/recorrências.
 *
 * O workspace é resolvido na construção do repositório (mesmo padrão de
 * `ItemRepository`/`ExecutionPlanRepository`), não em cada chamada.
 */
export interface LearningContentRepository {
  findCourseBySlug(slug: string): Promise<Course | null>;
  findCourseById(id: string): Promise<Course | null>;
  listCourses(): Promise<Course[]>;
  saveCourse(course: Course): Promise<void>;

  findModuleById(id: string): Promise<LearningModule | null>;
  listModulesByCourse(courseId: string): Promise<LearningModule[]>;
  saveModules(modules: LearningModule[]): Promise<void>;

  findLessonById(id: string): Promise<Lesson | null>;
  listLessonsByModule(moduleId: string): Promise<Lesson[]>;
  saveLessons(lessons: Lesson[]): Promise<void>;

  findPreferences(): Promise<LearningPreferences | null>;
  savePreferences(preferences: LearningPreferences): Promise<void>;

  findCoursePreferences(courseId: string): Promise<CoursePreferences | null>;
  saveCoursePreferences(preferences: CoursePreferences): Promise<void>;

  /** Quem está usando (para separar cursos de pessoas diferentes no mesmo workspace). */
  getViewer?(): Promise<LearningViewer | null>;
  /** Ids dos cursos visíveis ao usuário atual. */
  listVisibleCourseIds?(): Promise<string[]>;

  subscribe(listener: () => void): () => void;
}

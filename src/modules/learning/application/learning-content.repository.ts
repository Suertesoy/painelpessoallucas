import type {
  Course,
  LearningModule,
  LearningPreferences,
  CoursePreferences,
} from '../domain/learning.schema';

/**
 * Conteúdo de aprendizado: cursos, módulos e preferências (gerais e por
 * curso). Agrupados num único repositório porque mudam juntos com pouca
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

  listModulesByCourse(courseId: string): Promise<LearningModule[]>;
  saveModules(modules: LearningModule[]): Promise<void>;

  findPreferences(): Promise<LearningPreferences | null>;
  savePreferences(preferences: LearningPreferences): Promise<void>;

  findCoursePreferences(courseId: string): Promise<CoursePreferences | null>;
  saveCoursePreferences(preferences: CoursePreferences): Promise<void>;

  subscribe(listener: () => void): () => void;
}

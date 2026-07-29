import type { LessonProgress } from '../domain/lesson-progress.schema';

/**
 * Progresso de lição — repositório separado de `LearningContentRepository`
 * pelo mesmo motivo que `StudySessionRepository` já é separado: muda a
 * cada exercício respondido, bem mais dinâmico que curso/módulo/lição.
 */
export interface LessonProgressRepository {
  findByLesson(workspaceId: string, lessonId: string): Promise<LessonProgress | null>;
  /** Usada pela página do módulo para refletir conclusão sem N+1 queries. */
  listByModule(moduleId: string): Promise<LessonProgress[]>;
  save(progress: LessonProgress): Promise<void>;
  subscribe(listener: () => void): () => void;
}

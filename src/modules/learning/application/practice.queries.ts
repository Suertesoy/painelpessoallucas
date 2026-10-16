import type { LearningContentRepository } from './learning-content.repository';
import type { LessonProgressRepository } from './lesson-progress.repository';
import type { PracticeItemRepository } from './practice.repository';
import type { Lesson } from '../domain/learning.schema';
import {
  collectKnownKana,
  collectKnownWords,
  knownCharacterSet,
  studiedLessons,
  type KnownKana,
  type KnownWord,
} from '../practice/known-content';
import { isDue, isErrorItem } from '../practice/scheduling';
import type { PracticeItem } from '../practice/practice.schema';

export interface PracticePool {
  kana: KnownKana[];
  words: KnownWord[];
  studiedLessonCount: number;
}

export interface PracticeOverview {
  items: PracticeItem[];
  dueCount: number;
  errorCount: number;
  practicedCount: number;
}

export class PracticeQueries {
  constructor(
    private contentRepo: LearningContentRepository,
    private progressRepo: LessonProgressRepository,
    private practiceRepo: PracticeItemRepository
  ) {}

  /** Conteúdo disponível para prática: só o que as lições abertas já ensinaram. */
  async getPracticePool(courseId: string): Promise<PracticePool> {
    const modules = await this.contentRepo.listModulesByCourse(courseId);
    const perModule = await Promise.all(
      modules.map(async (m) => {
        const [lessons, progress] = await Promise.all([
          this.contentRepo.listLessonsByModule(m.id),
          this.progressRepo.listByModule(m.id),
        ]);
        return studiedLessons(lessons, progress);
      })
    );
    const lessons: Lesson[] = perModule.flat();
    const kana = collectKnownKana(lessons);
    const words = collectKnownWords(lessons, knownCharacterSet(kana));
    return { kana, words, studiedLessonCount: lessons.length };
  }

  async getPracticeOverview(courseId: string, today: string): Promise<PracticeOverview> {
    const items = await this.practiceRepo.listByCourse(courseId);
    return {
      items,
      dueCount: items.filter((i) => !isErrorItem(i) && isDue(i, today)).length,
      errorCount: items.filter(isErrorItem).length,
      practicedCount: items.length,
    };
  }
}

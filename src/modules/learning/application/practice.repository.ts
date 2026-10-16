import type { PracticeItem, PracticeItemKind } from '../practice/practice.schema';

/** Estado de revisão espaçada por habilidade. O workspace é resolvido na construção. */
export interface PracticeItemRepository {
  listByCourse(courseId: string): Promise<PracticeItem[]>;
  findByKey(courseId: string, kind: PracticeItemKind, subject: string): Promise<PracticeItem | null>;
  save(item: PracticeItem): Promise<void>;
  subscribe(listener: () => void): () => void;
}

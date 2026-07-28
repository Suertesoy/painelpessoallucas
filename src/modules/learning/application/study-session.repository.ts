import type { StudySession } from '../domain/learning.schema';

/** O workspace é resolvido na construção do repositório, não por chamada. */
export interface StudySessionRepository {
  save(session: StudySession): Promise<void>;
  findById(id: string): Promise<StudySession | null>;
  /** Sessão com status `in_progress` do workspace, se houver (no máximo uma). */
  findActive(): Promise<StudySession | null>;
  /** Sessões com `startedAt` em [startISO, endISO) — usado para o resumo do dia local. */
  findByDateRange(startISO: string, endISO: string): Promise<StudySession[]>;
  listRecent(limit: number): Promise<StudySession[]>;
  subscribe(listener: () => void): () => void;
}

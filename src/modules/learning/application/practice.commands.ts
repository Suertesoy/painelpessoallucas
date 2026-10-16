import { EventRepository } from '@/platform/events/event.repository';
import { todayDateStr } from '@/lib/dates';
import type { PracticeItemRepository } from './practice.repository';
import {
  PracticeItem,
  PracticeItemSchema,
  RecordPracticeResultDTO,
  RecordPracticeResultSchema,
} from '../practice/practice.schema';
import { applyPracticeResult } from '../practice/scheduling';

export class PracticeCommands {
  constructor(
    private repo: PracticeItemRepository,
    private eventRepo: EventRepository
  ) {}

  /**
   * Registra uma resposta de prática e reagenda o item (1, 3, 7 e 14 dias).
   * Erro: o item volta à caixa 0 e fica para reforço hoje. Acerto: avança
   * no máximo UMA caixa por dia local — repetir no mesmo dia é prática
   * extra, não progressão acelerada.
   */
  async recordResult(
    workspaceId: string,
    courseId: string,
    dto: RecordPracticeResultDTO,
    today: string = todayDateStr()
  ): Promise<PracticeItem> {
    const parsed = RecordPracticeResultSchema.parse(dto);
    const existing = await this.repo.findByKey(courseId, parsed.kind, parsed.subject);
    const progress = applyPracticeResult(existing, parsed.correct, today);
    const now = new Date().toISOString();

    const item: PracticeItem = {
      id: existing?.id ?? crypto.randomUUID(),
      workspaceId,
      courseId,
      kind: parsed.kind,
      script: existing?.script ?? parsed.script,
      subject: parsed.subject,
      ...progress,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    PracticeItemSchema.parse(item);
    await this.repo.save(item);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'learning.practice.answered',
      entityId: item.id,
      workspaceId,
      source: 'manual',
      payload: { kind: item.kind, subject: item.subject, correct: parsed.correct, box: item.box, dueOn: item.dueOn },
      createdAt: now,
    });

    return item;
  }
}

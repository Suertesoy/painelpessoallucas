import type { Reminder } from '../domain/reminder.schema';

export interface ReminderRepository {
  findById(id: string): Promise<Reminder | null>;
  /** No máximo um lembrete push pendente por item (ver ReminderCommands.setTaskReminder). */
  findPendingPushReminderByItem(itemId: string): Promise<Reminder | null>;
  save(reminder: Reminder): Promise<void>;
}

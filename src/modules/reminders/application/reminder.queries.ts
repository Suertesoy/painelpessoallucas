import { ReminderRepository } from './reminder.repository';
import type { Reminder } from '../domain/reminder.schema';

export class ReminderQueries {
  constructor(private reminderRepo: ReminderRepository) {}

  getPendingPushReminderForItem(itemId: string): Promise<Reminder | null> {
    return this.reminderRepo.findPendingPushReminderByItem(itemId);
  }
}

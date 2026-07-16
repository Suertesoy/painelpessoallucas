import { ItemRepository } from './item.repository';
import { Item } from '../domain/item.schema';
import { startOfDay, parseISO, subDays, isBefore } from 'date-fns';

export class ItemQueries {
  constructor(private itemRepo: ItemRepository) {}

  async listItems(): Promise<Item[]> {
    return this.itemRepo.findAll();
  }

  async listInboxItems(): Promise<Item[]> {
    const items = await this.itemRepo.findAll();
    return items.filter(item => item.status === 'inbox');
  }

  async searchItems(query: string): Promise<Item[]> {
    const q = query.toLowerCase();
    const items = await this.itemRepo.findAll();
    return items.filter(item => 
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.content && item.content.toLowerCase().includes(q)) ||
      (item.nextAction && item.nextAction.toLowerCase().includes(q))
    );
  }

  async listScheduledItems(date: string): Promise<Item[]> {
    const items = await this.itemRepo.findAll();
    const targetDate = startOfDay(parseISO(date));
    return items.filter(item => {
      if (!item.scheduledAt) return false;
      const scheduled = startOfDay(parseISO(item.scheduledAt));
      return scheduled.getTime() === targetDate.getTime();
    }).sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
  }

  async getTodayOverview(date: string): Promise<{ scheduled: Item[], due: Item[] }> {
    const items = await this.itemRepo.findAll();
    const targetDate = startOfDay(parseISO(date));

    const scheduled = items.filter(item => {
      if (!item.scheduledAt || item.status === 'completed' || item.status === 'archived') return false;
      return startOfDay(parseISO(item.scheduledAt)).getTime() === targetDate.getTime();
    }).sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());

    const due = items.filter(item => {
      if (!item.dueAt || item.status === 'completed' || item.status === 'archived') return false;
      return startOfDay(parseISO(item.dueAt)).getTime() === targetDate.getTime();
    });

    return { scheduled, due };
  }

  async getReviewOverview(): Promise<{ 
    overdue: Item[], 
    blocked: Item[], 
    oldInbox: Item[], 
    noProject: Item[] 
  }> {
    const items = await this.itemRepo.findAll();
    const now = new Date();
    const today = startOfDay(now);
    const thirtyDaysAgo = subDays(now, 30);

    const activeItems = items.filter(i => i.status !== 'completed' && i.status !== 'archived');

    const overdue = activeItems.filter(i => i.dueAt && isBefore(parseISO(i.dueAt), today));
    const blocked = activeItems.filter(i => i.status === 'blocked');
    const oldInbox = activeItems.filter(i => i.status === 'inbox' && isBefore(parseISO(i.createdAt), thirtyDaysAgo));
    const noProject = activeItems.filter(i => !i.projectId && i.status !== 'inbox');

    return { overdue, blocked, oldInbox, noProject };
  }
}

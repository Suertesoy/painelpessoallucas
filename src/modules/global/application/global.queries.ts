import { ItemQueries } from '@/modules/items/application/item.queries';
import { ProjectQueries } from '@/modules/projects/application/project.queries';
import { Item } from '@/modules/items/domain/item.schema';
import { Project } from '@/modules/projects/domain/project.schema';

export type GlobalSearchResult = 
  | { type: 'item'; data: Item }
  | { type: 'project'; data: Project };

export class GlobalQueries {
  constructor(
    private itemQueries: ItemQueries,
    private projectQueries: ProjectQueries
  ) {}

  async globalSearch(query: string): Promise<GlobalSearchResult[]> {
    if (!query || query.trim().length === 0) return [];

    const items = await this.itemQueries.searchItems(query);
    const projects = await this.projectQueries.searchProjects(query);

    const results: GlobalSearchResult[] = [
      ...projects.map(p => ({ type: 'project' as const, data: p })),
      ...items.map(i => ({ type: 'item' as const, data: i }))
    ];

    return results;
  }
}

import { ProjectRepository } from './project.repository';
import { EventRepository } from '@/platform/events/event.repository';
import { CreateProjectDTO, Project, ProjectSchema } from '../domain/project.schema';

export class ProjectCommands {
  constructor(
    private projectRepo: ProjectRepository,
    private eventRepo: EventRepository
  ) {}

  async createProject(dto: CreateProjectDTO, workspaceId: string): Promise<Project> {
    const project: Project = {
      id: crypto.randomUUID(),
      workspaceId,
      name: dto.name,
      description: dto.description,
      objective: dto.objective,
      status: dto.status || 'active',
      attentionLevel: dto.attentionLevel || 'normal',
      nextMilestone: dto.nextMilestone,
      dueAt: dto.dueAt,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    ProjectSchema.parse(project);
    await this.projectRepo.save(project);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'project.created',
      entityId: project.id,
      workspaceId,
      source: 'manual',
      payload: project,
      createdAt: new Date().toISOString(),
    });

    return project;
  }
}

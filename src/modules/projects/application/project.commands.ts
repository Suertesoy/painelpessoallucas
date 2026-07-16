import { ProjectRepository } from './project.repository';
import { EventRepository } from '@/platform/events/event.repository';
import { CreateProjectDTO, Project, ProjectSchema, UpdateProjectDTO } from '../domain/project.schema';

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

  async updateProject(id: string, dto: UpdateProjectDTO): Promise<Project> {
    const existing = await this.projectRepo.findById(id);
    if (!existing) throw new Error("Projeto não encontrado");

    const updated: Project = {
      ...existing,
      ...dto,
      updatedAt: new Date().toISOString()
    };

    ProjectSchema.parse(updated);
    await this.projectRepo.save(updated);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'project.updated',
      entityId: updated.id,
      workspaceId: updated.workspaceId,
      source: 'manual',
      payload: { previous: existing, new: updated },
      createdAt: new Date().toISOString(),
    });

    return updated;
  }

  async archiveProject(id: string): Promise<Project> {
    const existing = await this.projectRepo.findById(id);
    if (!existing) throw new Error("Projeto não encontrado");

    const updated: Project = {
      ...existing,
      status: 'archived',
      updatedAt: new Date().toISOString()
    };

    ProjectSchema.parse(updated);
    await this.projectRepo.save(updated);

    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type: 'project.archived',
      entityId: updated.id,
      workspaceId: updated.workspaceId,
      source: 'manual',
      payload: updated,
      createdAt: new Date().toISOString(),
    });

    return updated;
  }
}

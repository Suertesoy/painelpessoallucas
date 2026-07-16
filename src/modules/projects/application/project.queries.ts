import { ProjectRepository } from './project.repository';
import { Project } from '../domain/project.schema';

export class ProjectQueries {
  constructor(private projectRepo: ProjectRepository) {}

  async listProjects(): Promise<Project[]> {
    return this.projectRepo.findAll();
  }

  async getProjectById(id: string): Promise<Project | null> {
    return this.projectRepo.findById(id);
  }

  async searchProjects(query: string): Promise<Project[]> {
    const q = query.toLowerCase();
    const projects = await this.projectRepo.findAll();
    return projects.filter(p => 
      p.name.toLowerCase().includes(q) ||
      (p.objective && p.objective.toLowerCase().includes(q))
    );
  }
}

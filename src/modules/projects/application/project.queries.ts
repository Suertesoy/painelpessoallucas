import { ProjectRepository } from './project.repository';
import { Project } from '../domain/project.schema';

export class ProjectQueries {
  constructor(private projectRepo: ProjectRepository) {}

  async listProjects(): Promise<Project[]> {
    return this.projectRepo.findAll();
  }

  /**
   * Projetos elegíveis para receber TRABALHO NOVO (nova tarefa, novo plano,
   * PlanAction "specific"). Só `status === 'active'` — pausado/concluído/
   * arquivado nunca aparecem aqui, mesmo que já existam com dados vinculados
   * (esses continuam resolvíveis via `listProjects`/`getProjectById` para
   * exibição histórica, só não voltam a receber atribuição nova).
   */
  async listAssignableProjects(): Promise<Project[]> {
    const all = await this.projectRepo.findAll();
    return all.filter(p => p.status === 'active');
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

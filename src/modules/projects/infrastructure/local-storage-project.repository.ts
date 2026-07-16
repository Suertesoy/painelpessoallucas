import { ProjectRepository } from '../application/project.repository';
import { Project } from '../domain/project.schema';
import { LocalStorageAdapter } from '@/platform/storage/local-storage-adapter';

export class LocalStorageProjectRepository extends LocalStorageAdapter<Project> implements ProjectRepository {
  constructor() {
    super('painelpessoal_projects');
  }

  public save(project: Project): Promise<void> {
    const projects = this.getItems();
    const index = projects.findIndex(p => p.id === project.id);
    if (index >= 0) {
      projects[index] = project;
    } else {
      projects.push(project);
    }
    this.saveItems(projects);
    return Promise.resolve();
  }

  public findById(id: string): Promise<Project | null> {
    const projects = this.getItems();
    const project = projects.find(p => p.id === id);
    return Promise.resolve(project || null);
  }

  public findAll(): Promise<Project[]> {
    return Promise.resolve(this.getItems());
  }

  public delete(id: string): Promise<void> {
    const projects = this.getItems();
    const filtered = projects.filter(p => p.id !== id);
    this.saveItems(filtered);
    return Promise.resolve();
  }
}

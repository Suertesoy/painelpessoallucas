export interface ProjectRepository {
  save(project: import('../domain/project.schema').Project): Promise<void>;
  findById(id: string): Promise<import('../domain/project.schema').Project | null>;
  findAll(): Promise<import('../domain/project.schema').Project[]>;
  delete(id: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export interface ProjectRepository {
  save(project: import('../domain/project.schema').Project): Promise<void>;
  findById(id: string): Promise<import('../domain/project.schema').Project | null>;
  findAll(): Promise<import('../domain/project.schema').Project[]>;
  /**
   * Exclusão permanente e irreversível — só deve ser chamada para projetos
   * já arquivados (guarda reforçada na RPC `delete_project_permanently`).
   * Nunca confundir com arquivar (soft, reversível, via `save` com
   * `status: 'archived'`).
   */
  deletePermanently(id: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}

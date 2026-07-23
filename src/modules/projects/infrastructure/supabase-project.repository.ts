'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { ProjectRepository } from '../application/project.repository';
import { Project, ProjectSchema } from '../domain/project.schema';
import { ChangeNotifier } from '@/platform/supabase/change-notifier';

export type ProjectRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  objective: string | null;
  status: string;
  attention_level: string;
  next_milestone: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export function rowToProject(row: ProjectRow): Project {
  return ProjectSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description ?? undefined,
    objective: row.objective ?? undefined,
    status: row.status,
    attentionLevel: row.attention_level,
    nextMilestone: row.next_milestone ?? undefined,
    dueAt: row.due_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? undefined,
  });
}

function projectToRow(project: Project) {
  return {
    id: project.id,
    workspace_id: project.workspaceId,
    name: project.name,
    description: project.description ?? null,
    objective: project.objective ?? null,
    status: project.status,
    attention_level: project.attentionLevel,
    next_milestone: project.nextMilestone ?? null,
    due_at: project.dueAt ?? null,
    created_at: project.createdAt,
    archived_at: project.archivedAt ?? null,
  };
}

export class SupabaseProjectRepository implements ProjectRepository {
  constructor(
    private supabase: SupabaseClient,
    private workspaceId: string,
    private notifier: ChangeNotifier
  ) {}

  async save(project: Project): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .upsert(projectToRow(project), { onConflict: 'id' });
    if (error) {
      throw new Error(`Não foi possível salvar o projeto: ${error.message}`);
    }
    this.notifier.notify();
  }

  async findById(id: string): Promise<Project | null> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) {
      throw new Error(`Não foi possível carregar o projeto: ${error.message}`);
    }
    return data ? rowToProject(data as ProjectRow) : null;
  }

  async findAll(): Promise<Project[]> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) {
      throw new Error(`Não foi possível carregar os projetos: ${error.message}`);
    }
    return (data as ProjectRow[]).map(rowToProject);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      throw new Error(`Não foi possível excluir o projeto: ${error.message}`);
    }
    this.notifier.notify();
  }

  subscribe(listener: () => void): () => void {
    return this.notifier.subscribe(listener);
  }
}

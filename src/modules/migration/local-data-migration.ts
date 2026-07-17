'use client';

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ItemSchema, Item } from '@/modules/items/domain/item.schema';
import { ProjectSchema, Project } from '@/modules/projects/domain/project.schema';
import { DailyPlanSchema, DailyPlan } from '@/modules/planning/domain/daily-plan.schema';
import { DomainEventSchema, DomainEvent } from '@/platform/events/event.schema';

/**
 * Migração assistida dos dados da Fase 1 (localStorage) para o Supabase.
 *
 * Princípios:
 * - Backup JSON antes de migrar; nada é apagado automaticamente.
 * - Upsert com os identificadores originais (UUIDs) → idempotente.
 * - workspaceId local ('ws-1') é remapeado para o workspace real da sessão.
 * - O estado da migração fica em localStorage e um evento de domínio marca a
 *   conclusão no servidor.
 */

export const LOCAL_KEYS = {
  items: 'painelpessoal_items',
  projects: 'painelpessoal_projects',
  dailyPlans: 'painelpessoal_dailyplan',
  events: 'painelpessoal_events',
} as const;

export const MIGRATION_STATE_KEY = 'painelpessoal_migration';

export interface MigrationState {
  status: 'completed';
  batchId: string;
  completedAt: string;
  workspaceId: string;
}

export interface LocalDataSnapshot {
  items: Item[];
  projects: Project[];
  dailyPlans: DailyPlan[];
  events: DomainEvent[];
  invalid: { collection: string; count: number; firstError: string }[];
}

export interface MigrationCounts {
  items: number;
  projects: number;
  dailyPlans: number;
  events: number;
}

function readCollection<T>(key: string, schema: z.ZodType<T>): { valid: T[]; invalidCount: number; firstError: string } {
  if (typeof window === 'undefined') return { valid: [], invalidCount: 0, firstError: '' };
  let raw: unknown[] = [];
  try {
    const data = window.localStorage.getItem(key);
    raw = data ? (JSON.parse(data) as unknown[]) : [];
  } catch {
    return { valid: [], invalidCount: 0, firstError: 'JSON inválido no localStorage' };
  }
  const valid: T[] = [];
  let invalidCount = 0;
  let firstError = '';
  for (const entry of raw) {
    const parsed = schema.safeParse(entry);
    if (parsed.success) {
      valid.push(parsed.data);
    } else {
      invalidCount += 1;
      if (!firstError) firstError = parsed.error.issues[0]?.message ?? 'erro de validação';
    }
  }
  return { valid, invalidCount, firstError };
}

/** Lê e valida (Zod) todos os dados locais da Fase 1. */
export function readLocalData(): LocalDataSnapshot {
  const items = readCollection(LOCAL_KEYS.items, ItemSchema);
  const projects = readCollection(LOCAL_KEYS.projects, ProjectSchema);
  const dailyPlans = readCollection(LOCAL_KEYS.dailyPlans, DailyPlanSchema);
  const events = readCollection(LOCAL_KEYS.events, DomainEventSchema);

  const invalid: LocalDataSnapshot['invalid'] = [];
  if (items.invalidCount) invalid.push({ collection: 'itens', count: items.invalidCount, firstError: items.firstError });
  if (projects.invalidCount) invalid.push({ collection: 'projetos', count: projects.invalidCount, firstError: projects.firstError });
  if (dailyPlans.invalidCount) invalid.push({ collection: 'planos diários', count: dailyPlans.invalidCount, firstError: dailyPlans.firstError });
  if (events.invalidCount) invalid.push({ collection: 'eventos', count: events.invalidCount, firstError: events.firstError });

  return {
    items: items.valid,
    projects: projects.valid,
    dailyPlans: dailyPlans.valid,
    events: events.valid,
    invalid,
  };
}

export function hasLocalData(snapshot: LocalDataSnapshot): boolean {
  return (
    snapshot.items.length > 0 ||
    snapshot.projects.length > 0 ||
    snapshot.dailyPlans.length > 0
  );
}

export function getMigrationState(): MigrationState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MIGRATION_STATE_KEY);
    return raw ? (JSON.parse(raw) as MigrationState) : null;
  } catch {
    return null;
  }
}

/** Gera o backup JSON completo (inclusive registros inválidos, em bruto). */
export function buildBackupJson(): string {
  const backup: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    source: 'painelpessoal-localStorage',
  };
  for (const [name, key] of Object.entries(LOCAL_KEYS)) {
    try {
      const raw = window.localStorage.getItem(key);
      backup[name] = raw ? JSON.parse(raw) : [];
    } catch {
      backup[name] = { error: 'JSON inválido', raw: window.localStorage.getItem(key) };
    }
  }
  return JSON.stringify(backup, null, 2);
}

export function downloadBackup(): void {
  const blob = new Blob([buildBackupJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `painel-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface MigrationResult {
  batchId: string;
  migrated: MigrationCounts;
  remote: MigrationCounts;
  matches: boolean;
}

/**
 * Executa a migração de forma idempotente (upsert pelos IDs originais).
 * Pode ser reexecutada com segurança: nenhum registro é duplicado.
 */
export async function migrateLocalData(
  supabase: SupabaseClient,
  workspaceId: string,
  snapshot: LocalDataSnapshot,
  onProgress: (step: string) => void
): Promise<MigrationResult> {
  const batchId = crypto.randomUUID();

  // 1. Projetos primeiro (itens têm FK para projects).
  onProgress('Migrando projetos…');
  if (snapshot.projects.length > 0) {
    const { error } = await supabase.from('projects').upsert(
      snapshot.projects.map((p) => ({
        id: p.id,
        workspace_id: workspaceId,
        name: p.name,
        description: p.description ?? null,
        objective: p.objective ?? null,
        status: p.status,
        attention_level: p.attentionLevel,
        next_milestone: p.nextMilestone ?? null,
        due_at: p.dueAt ?? null,
        created_at: p.createdAt,
        archived_at: p.archivedAt ?? null,
      })),
      { onConflict: 'id' }
    );
    if (error) throw new Error(`Falha ao migrar projetos: ${error.message}`);
  }

  // 2. Itens.
  onProgress('Migrando itens…');
  if (snapshot.items.length > 0) {
    // projectId órfão (projeto apagado localmente) → null para não violar FK.
    const projectIds = new Set(snapshot.projects.map((p) => p.id));
    const { error } = await supabase.from('items').upsert(
      snapshot.items.map((i) => ({
        id: i.id,
        workspace_id: workspaceId,
        project_id: i.projectId && projectIds.has(i.projectId) ? i.projectId : null,
        title: i.title ?? null,
        content: i.content ?? null,
        type: i.type,
        status: i.status,
        priority: i.priority,
        due_at: i.dueAt ?? null,
        scheduled_at: i.scheduledAt ?? null,
        estimated_minutes: i.estimatedMinutes ?? null,
        next_action: i.nextAction ?? null,
        source: i.source,
        created_at: i.createdAt,
        completed_at: i.completedAt ?? null,
        archived_at: i.archivedAt ?? null,
      })),
      { onConflict: 'id' }
    );
    if (error) throw new Error(`Falha ao migrar itens: ${error.message}`);
  }

  // 3. Planos diários (upsert por workspace+data; itens de foco recriados).
  onProgress('Migrando planos diários…');
  const itemIds = new Set(snapshot.items.map((i) => i.id));
  for (const plan of snapshot.dailyPlans) {
    const { data: planRow, error: planError } = await supabase
      .from('daily_plans')
      .upsert({ workspace_id: workspaceId, date: plan.date }, { onConflict: 'workspace_id,date' })
      .select('id')
      .single();
    if (planError || !planRow) {
      throw new Error(`Falha ao migrar plano de ${plan.date}: ${planError?.message ?? 'sem retorno'}`);
    }
    const validFocus = plan.focusItemIds.filter((id) => itemIds.has(id));
    if (validFocus.length > 0) {
      const { error: dpiError } = await supabase.from('daily_plan_items').upsert(
        validFocus.map((itemId, index) => ({
          workspace_id: workspaceId,
          daily_plan_id: planRow.id,
          item_id: itemId,
          position: index,
        })),
        { onConflict: 'daily_plan_id,item_id' }
      );
      if (dpiError) throw new Error(`Falha ao migrar foco de ${plan.date}: ${dpiError.message}`);
    }
  }

  // 4. Eventos de domínio (histórico; upsert por id — idempotente).
  onProgress('Migrando histórico de eventos…');
  if (snapshot.events.length > 0) {
    const { error } = await supabase.from('domain_events').upsert(
      snapshot.events.map((e) => ({
        id: e.id,
        workspace_id: workspaceId,
        type: e.type,
        entity_id: e.entityId,
        source: e.source,
        payload: e.payload ?? null,
        created_at: e.createdAt,
        processed_at: e.processedAt ?? null,
      })),
      { onConflict: 'id', ignoreDuplicates: true }
    );
    if (error) throw new Error(`Falha ao migrar eventos: ${error.message}`);
  }

  // 5. Conferência: compara quantidades locais e remotas.
  onProgress('Conferindo quantidades…');
  const remote = await countRemote(supabase, workspaceId);
  const migrated: MigrationCounts = {
    items: snapshot.items.length,
    projects: snapshot.projects.length,
    dailyPlans: snapshot.dailyPlans.length,
    events: snapshot.events.length,
  };
  const matches =
    remote.items >= migrated.items &&
    remote.projects >= migrated.projects &&
    remote.dailyPlans >= migrated.dailyPlans &&
    remote.events >= migrated.events;

  // 6. Registra a conclusão (evento no servidor + estado local).
  await supabase.from('domain_events').insert({
    workspace_id: workspaceId,
    type: 'migration.completed',
    entity_id: batchId,
    source: 'import',
    payload: { batchId, migrated, remote },
  });

  const state: MigrationState = {
    status: 'completed',
    batchId,
    completedAt: new Date().toISOString(),
    workspaceId,
  };
  window.localStorage.setItem(MIGRATION_STATE_KEY, JSON.stringify(state));

  return { batchId, migrated, remote, matches };
}

export async function countRemote(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<MigrationCounts> {
  const count = async (table: string) => {
    const { count: n, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);
    if (error) throw new Error(`Falha ao contar ${table}: ${error.message}`);
    return n ?? 0;
  };
  return {
    items: await count('items'),
    projects: await count('projects'),
    dailyPlans: await count('daily_plans'),
    events: await count('domain_events'),
  };
}

/**
 * Remove os dados locais antigos. Só deve ser chamada após confirmação
 * explícita do usuário (o assistente exige a migração concluída antes).
 */
export function clearLocalData(): void {
  for (const key of Object.values(LOCAL_KEYS)) {
    window.localStorage.removeItem(key);
  }
}

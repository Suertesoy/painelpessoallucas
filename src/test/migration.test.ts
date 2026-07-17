import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  readLocalData,
  hasLocalData,
  migrateLocalData,
  clearLocalData,
  LOCAL_KEYS,
  MIGRATION_STATE_KEY,
} from '@/modules/migration/local-data-migration';

// ----------------------------------------------------------------------------
// Infra de teste: localStorage em memória + Supabase mock (sem rede)
// ----------------------------------------------------------------------------

function installLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  vi.stubGlobal('window', { localStorage });
  return store;
}

type Row = Record<string, unknown>;

/**
 * Mock mínimo do PostgREST: armazena linhas por tabela e respeita a chave de
 * conflito do upsert (suficiente para provar idempotência da migração).
 */
class MockSupabase {
  tables = new Map<string, Map<string, Row>>();

  private keyFor(table: string, row: Row, onConflict?: string): string {
    if (onConflict) {
      return onConflict.split(',').map((c) => String(row[c.trim()])).join('|');
    }
    return String(row.id ?? crypto.randomUUID());
  }

  private tableMap(table: string): Map<string, Row> {
    if (!this.tables.has(table)) this.tables.set(table, new Map());
    return this.tables.get(table)!;
  }

  from(table: string) {
    const apply = (rows: Row | Row[], onConflict?: string, ignoreDuplicates?: boolean) => {
      const list = Array.isArray(rows) ? rows : [rows];
      let firstStored: Row | null = null;
      for (const row of list) {
        const map = this.tableMap(table);
        const key = this.keyFor(table, row, onConflict);
        if (map.has(key)) {
          if (!ignoreDuplicates) map.set(key, { ...map.get(key)!, ...row });
        } else {
          map.set(key, { id: row.id ?? crypto.randomUUID(), ...row });
        }
        if (!firstStored) firstStored = map.get(key)!;
      }
      return firstStored;
    };

    const builder = (stored: Row | null) => ({
      // upsert(...).select('id').single()
      select: () => ({
        single: async () => ({ data: stored, error: null }),
      }),
      // await upsert(...) direto
      then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
    });

    return {
      upsert: (rows: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) =>
        builder(apply(rows, opts?.onConflict, opts?.ignoreDuplicates)),
      insert: (rows: Row | Row[]) => builder(apply(rows)),
      select: () => ({
        eq: () => ({
          then: (resolve: (v: { count: number; error: null }) => void) =>
            resolve({ count: this.tableMap(table).size, error: null }),
        }),
      }),
      delete: () => ({
        eq: async () => ({ error: null }),
      }),
    };
  }

  asClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }

  count(table: string): number {
    return this.tableMap(table).size;
  }
}

const WORKSPACE = '11111111-1111-4111-8111-111111111111';

const validItem = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  workspaceId: 'ws-1',
  title: 'Tarefa migrada',
  type: 'task',
  status: 'inbox',
  priority: 'normal',
  source: 'manual',
  createdAt: '2026-01-10T12:00:00.000Z',
  updatedAt: '2026-01-10T12:00:00.000Z',
};

const validProject = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  workspaceId: 'ws-1',
  name: 'Projeto migrado',
  status: 'active',
  attentionLevel: 'normal',
  createdAt: '2026-01-10T12:00:00.000Z',
  updatedAt: '2026-01-10T12:00:00.000Z',
};

const validPlan = {
  workspaceId: 'ws-1',
  date: '2026-01-10',
  focusItemIds: [validItem.id],
  createdAt: '2026-01-10T12:00:00.000Z',
  updatedAt: '2026-01-10T12:00:00.000Z',
};

describe('Migração dos dados locais', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = installLocalStorage();
  });

  it('lê e valida dados locais com Zod, separando registros inválidos', () => {
    store.set(LOCAL_KEYS.items, JSON.stringify([validItem, { id: 'não-é-uuid' }]));
    store.set(LOCAL_KEYS.projects, JSON.stringify([validProject]));

    const snapshot = readLocalData();

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.invalid).toHaveLength(1);
    expect(snapshot.invalid[0].collection).toBe('itens');
    expect(hasLocalData(snapshot)).toBe(true);
  });

  it('degrada com segurança quando o localStorage está corrompido', () => {
    store.set(LOCAL_KEYS.items, '{corrompido');
    const snapshot = readLocalData();
    expect(snapshot.items).toHaveLength(0);
    expect(hasLocalData(snapshot)).toBe(false);
  });

  it('migra com upsert pelos IDs originais e remapeia o workspace', async () => {
    store.set(LOCAL_KEYS.items, JSON.stringify([validItem]));
    store.set(LOCAL_KEYS.projects, JSON.stringify([validProject]));
    store.set(LOCAL_KEYS.dailyPlans, JSON.stringify([validPlan]));

    const mock = new MockSupabase();
    const snapshot = readLocalData();
    const result = await migrateLocalData(mock.asClient(), WORKSPACE, snapshot, () => {});

    expect(mock.count('items')).toBe(1);
    expect(mock.count('projects')).toBe(1);
    expect(mock.count('daily_plans')).toBe(1);
    expect(result.matches).toBe(true);

    const migratedItem = [...mock.tables.get('items')!.values()][0];
    expect(migratedItem.workspace_id).toBe(WORKSPACE);
    expect(migratedItem.id).toBe(validItem.id);

    // Estado de conclusão persistido
    expect(store.get(MIGRATION_STATE_KEY)).toBeTruthy();
  });

  it('é idempotente: reexecutar não duplica registros', async () => {
    store.set(LOCAL_KEYS.items, JSON.stringify([validItem]));
    store.set(LOCAL_KEYS.projects, JSON.stringify([validProject]));
    store.set(LOCAL_KEYS.dailyPlans, JSON.stringify([validPlan]));

    const mock = new MockSupabase();
    const snapshot = readLocalData();

    await migrateLocalData(mock.asClient(), WORKSPACE, snapshot, () => {});
    await migrateLocalData(mock.asClient(), WORKSPACE, snapshot, () => {});

    expect(mock.count('items')).toBe(1);
    expect(mock.count('projects')).toBe(1);
    expect(mock.count('daily_plans')).toBe(1);
    expect(mock.count('daily_plan_items')).toBe(1);
  });

  it('anula projectId órfão para não violar a FK', async () => {
    const orphanItem = { ...validItem, projectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' };
    store.set(LOCAL_KEYS.items, JSON.stringify([orphanItem]));

    const mock = new MockSupabase();
    await migrateLocalData(mock.asClient(), WORKSPACE, readLocalData(), () => {});

    const migrated = [...mock.tables.get('items')!.values()][0];
    expect(migrated.project_id).toBeNull();
  });

  it('só remove dados locais quando explicitamente solicitado', async () => {
    store.set(LOCAL_KEYS.items, JSON.stringify([validItem]));

    const mock = new MockSupabase();
    await migrateLocalData(mock.asClient(), WORKSPACE, readLocalData(), () => {});

    // Migração NÃO apaga
    expect(store.get(LOCAL_KEYS.items)).toBeTruthy();

    clearLocalData();
    expect(store.get(LOCAL_KEYS.items)).toBeUndefined();
  });
});

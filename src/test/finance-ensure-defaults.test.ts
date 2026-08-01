// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { ensureFinanceDefaults } from '@/modules/finance/infrastructure/ensure-finance-defaults';
import { DEFAULT_FINANCE_CATEGORIES } from '@/modules/finance/domain/finance-category.schema';
import { DEFAULT_FINANCE_SOURCES } from '@/modules/finance/domain/finance-source.schema';

/**
 * Inicialização idempotente de categorias, das três origens de cartão e da
 * configuração — item 1 da lista de testes obrigatórios.
 */

type Row = Record<string, unknown>;

function makeFakeSupabase(initial: Record<string, Row[]> = {}) {
  const state: Record<string, Row[]> = Object.fromEntries(
    Object.entries(initial).map(([k, v]) => [k, [...v]])
  );
  const table = (name: string) => (state[name] ??= []);

  function matches(row: Row, filters: { col: string; val: unknown }[]) {
    return filters.every((f) => row[f.col] === f.val);
  }

  return {
    state,
    from(name: string) {
      const rows = table(name);
      return {
        select() {
          const filters: { col: string; val: unknown }[] = [];
          let orderCol: string | null = null;
          const builder = {
            eq(col: string, val: unknown) {
              filters.push({ col, val });
              return builder;
            },
            order(col: string) {
              orderCol = col;
              return builder;
            },
            maybeSingle: async () => {
              const found = rows.filter((r) => matches(r, filters));
              return { data: found[0] ?? null, error: null };
            },
            then(resolve: (v: { data: Row[]; error: null }) => void) {
              let found = rows.filter((r) => matches(r, filters));
              if (orderCol) {
                const col = orderCol;
                found = [...found].sort((a, b) => ((a[col] as number) > (b[col] as number) ? 1 : -1));
              }
              resolve({ data: found, error: null });
            },
          };
          return builder;
        },
        insert(payload: Row) {
          const newRow: Row = {
            id: crypto.randomUUID(),
            created_at: '2026-07-31T10:00:00.000Z',
            updated_at: '2026-07-31T10:00:00.000Z',
            ...payload,
          };
          rows.push(newRow);
          return { select: () => ({ single: async () => ({ data: newRow, error: null }) }) };
        },
        upsert(payload: Row[], opts: { onConflict: string; ignoreDuplicates?: boolean }) {
          const conflictCols = opts.onConflict.split(',');
          const created: Row[] = [];
          for (const item of payload) {
            const exists = rows.some((r) => conflictCols.every((c) => r[c] === item[c]));
            if (!exists) {
              const newRow: Row = {
                id: crypto.randomUUID(),
                created_at: '2026-07-31T10:00:00.000Z',
                updated_at: '2026-07-31T10:00:00.000Z',
                ...item,
              };
              rows.push(newRow);
              created.push(newRow);
            }
          }
          return { select: async () => ({ data: created, error: null }) };
        },
      };
    },
  };
}

const WS_A = 'ws-a';
const WS_B = 'ws-b';

describe('ensureFinanceDefaults', () => {
  it('cria as 13 categorias e as 3 origens de cartão num workspace novo', async () => {
    const supabase = makeFakeSupabase();
    const result = await ensureFinanceDefaults(supabase as never, WS_A);

    expect(result.categories).toHaveLength(DEFAULT_FINANCE_CATEGORIES.length);
    expect(result.sources).toHaveLength(DEFAULT_FINANCE_SOURCES.length);
    expect(result.createdCategories).toHaveLength(DEFAULT_FINANCE_CATEGORIES.length);
    expect(result.createdSources).toHaveLength(DEFAULT_FINANCE_SOURCES.length);
    expect(result.createdSettings).toBe(true);
    expect(result.categories.map((c) => c.slug)).toContain('nao-classificado');
    expect(result.sources.map((s) => s.name)).toEqual(
      expect.arrayContaining(['Cartão Nubank Lucas', 'Cartão C6 Lucas', 'Cartão Nubank Matheus'])
    );
  });

  it('é idempotente: a segunda chamada não cria nem duplica nada', async () => {
    const supabase = makeFakeSupabase();
    await ensureFinanceDefaults(supabase as never, WS_A);
    const second = await ensureFinanceDefaults(supabase as never, WS_A);

    expect(second.createdCategories).toHaveLength(0);
    expect(second.createdSources).toHaveLength(0);
    expect(second.createdSettings).toBe(false);
    expect(second.categories).toHaveLength(DEFAULT_FINANCE_CATEGORIES.length);
    expect(supabase.state.finance_categories.filter((c) => c.workspace_id === WS_A)).toHaveLength(
      DEFAULT_FINANCE_CATEGORIES.length
    );
  });

  it('isola categorias/origens por workspace', async () => {
    const supabase = makeFakeSupabase();
    const a = await ensureFinanceDefaults(supabase as never, WS_A);
    const b = await ensureFinanceDefaults(supabase as never, WS_B);

    expect(a.categories.every((c) => c.workspace_id === WS_A)).toBe(true);
    expect(b.categories.every((c) => c.workspace_id === WS_B)).toBe(true);
    expect(a.categories.map((c) => c.id)).not.toEqual(b.categories.map((c) => c.id));
  });

  it('configuração criada começa com valor padrão de renda do Matheus em zero centavos', async () => {
    const supabase = makeFakeSupabase();
    const result = await ensureFinanceDefaults(supabase as never, WS_A);
    expect(result.settings.default_matheus_income_cents).toBe(0);
  });
});

/**
 * Fake mínimo de um SupabaseClient para testes de rota/materialização que
 * fazem várias chamadas encadeadas (.select().eq().is()...). Guarda tabelas
 * em memória; não reimplementa RLS, índices únicos reais nem transações —
 * só o suficiente para exercitar a lógica de aplicação sob teste.
 */

type Row = Record<string, unknown>;

function matches(row: Row, col: string, op: 'eq' | 'is' | 'in', val: unknown): boolean {
  if (op === 'eq') return row[col] === val;
  if (op === 'is') return val === null ? row[col] == null : row[col] === val;
  if (op === 'in') return Array.isArray(val) && val.includes(row[col]);
  return true;
}

class SelectBuilder {
  private filters: { col: string; op: 'eq' | 'is' | 'in'; val: unknown }[] = [];
  constructor(private rows: Row[]) {}

  eq(col: string, val: unknown) {
    this.filters.push({ col, op: 'eq', val });
    return this;
  }
  is(col: string, val: unknown) {
    this.filters.push({ col, op: 'is', val });
    return this;
  }
  in(col: string, val: unknown[]) {
    this.filters.push({ col, op: 'in', val });
    return this;
  }
  order() {
    return this;
  }
  /** Não modela a combinação real de condições — só evita que chamadas reais
   * (ex.: `.or('next_occurrence_at.is.null,...')`) quebrem em teste. */
  or() {
    return this;
  }
  private resolved(): Row[] {
    return this.rows.filter((r) => this.filters.every((f) => matches(r, f.col, f.op, f.val)));
  }
  limit(n: number) {
    const limited = { data: this.resolved().slice(0, n), error: null };
    return {
      ...limited,
      maybeSingle: async () => ({ data: limited.data[0] ?? null, error: null }),
      then: (resolve: (v: typeof limited) => unknown) => Promise.resolve(limited).then(resolve),
    };
  }
  async maybeSingle() {
    const data = this.resolved();
    return { data: data[0] ?? null, error: null };
  }
  async single() {
    const data = this.resolved();
    return data[0]
      ? { data: data[0], error: null }
      : { data: null, error: { message: 'not found', code: 'PGRST116' } };
  }
  then(resolve: (v: { data: Row[]; error: null }) => unknown) {
    return Promise.resolve({ data: this.resolved(), error: null }).then(resolve);
  }
}

export function createFakeSupabase(initial: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = { ...initial };
  const rowsOf = (table: string) => (tables[table] ??= []);

  const client = {
    tables,
    from(table: string) {
      return {
        select() {
          return new SelectBuilder(rowsOf(table));
        },
        insert(payload: Row | Row[]) {
          const arr = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ ...r }));
          rowsOf(table).push(...arr);
          return {
            select() {
              return { single: async () => ({ data: arr[0] ?? null, error: null }) };
            },
            then: (resolve: (v: { error: null }) => unknown) =>
              Promise.resolve({ error: null }).then(resolve),
          };
        },
        update(patch: Row) {
          return {
            eq: async (col: string, val: unknown) => {
              for (const r of rowsOf(table)) if (r[col] === val) Object.assign(r, patch);
              return { error: null };
            },
          };
        },
        upsert(payload: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
          const arr = Array.isArray(payload) ? payload : [payload];
          // onConflict pode ser uma chave composta ("recurrence_rule_id,occurrence_at")
          // — precisa comparar TODAS as colunas, senão linhas de entidades
          // diferentes (ex.: duas recurrence_rules distintas) colidem
          // erradamente entre si por uma coluna indefinida em comum.
          const conflictCols = opts?.onConflict?.split(',').map((c) => c.trim());
          const rows = rowsOf(table);
          for (const r of arr) {
            const clash = conflictCols
              ? rows.find((x) => conflictCols.every((c) => x[c] === r[c]))
              : undefined;
            if (clash) {
              if (!opts?.ignoreDuplicates) Object.assign(clash, r);
              continue;
            }
            rows.push({ ...r });
          }
          return Promise.resolve({ error: null });
        },
        delete() {
          return {
            eq: async (col: string, val: unknown) => {
              tables[table] = rowsOf(table).filter((r) => r[col] !== val);
              return { error: null };
            },
          };
        },
      };
    },
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
  };

  return client;
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;

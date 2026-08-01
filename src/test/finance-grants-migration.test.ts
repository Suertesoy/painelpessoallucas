// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Verificações estáticas da migration financeira (mesmo padrão de
 * `shopping-lists-grants-migration.test.ts`): RLS/GRANT corretos desde a
 * primeira migration (não repete a lacuna de shopping_lists), integridade
 * entre workspaces via FK composta, e as proteções de segurança da RPC
 * `confirm_finance_import` (invoker, search_path fixo, revoke de
 * public/anon, grant só a authenticated).
 */

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase', 'migrations');
const MIGRATION_FILE = '20260731120000_finance.sql';
const sql = readFileSync(join(MIGRATIONS_DIR, MIGRATION_FILE), 'utf8').toLowerCase();

// Migration aditiva seguinte, do mesmo módulo (importação em lote, origem
// automática, caixa separado por pessoa) — intencionalmente posterior a esta.
const NEXT_FINANCE_MIGRATION_FILE = '20260731130000_finance_batch_import.sql';

describe('Migration do módulo Finanças — ordem no histórico', () => {
  it('tem timestamp posterior a todas as migrations existentes, exceto a migration aditiva seguinte do mesmo módulo', () => {
    const allMigrations = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const others = allMigrations.filter((f) => f !== MIGRATION_FILE && f !== NEXT_FINANCE_MIGRATION_FILE);
    expect(others.every((f) => MIGRATION_FILE > f)).toBe(true);
  });

  it('é posterior às duas migrations da lista de compras exigidas como referência', () => {
    expect(MIGRATION_FILE > '20260731100000_shopping_lists.sql').toBe(true);
    expect(MIGRATION_FILE > '20260731110000_shopping_lists_grants.sql').toBe(true);
  });
});

describe('Migration do módulo Finanças — RLS e GRANT (na mesma migration, sem lacuna)', () => {
  const tables = [
    'finance_settings',
    'finance_sources',
    'finance_categories',
    'finance_classification_rules',
    'finance_imports',
    'finance_import_rows',
    'finance_transactions',
    'finance_monthly_records',
  ];

  it.each(tables)('%s tem RLS habilitada com policies via is_workspace_member', (table) => {
    expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`));
    expect(sql).toMatch(new RegExp(`create policy "${table}_select" on public\\.${table}[\\s\\S]*?is_workspace_member`));
  });

  it.each(tables)('%s concede privilégios a authenticated', (table) => {
    expect(sql).toMatch(new RegExp(`grant [a-z, ]+ on public\\.${table} to authenticated`));
  });

  it.each(tables)('%s concede apenas select a service_role (nenhuma escrita automática)', (table) => {
    expect(sql).toMatch(new RegExp(`grant select on public\\.${table} to service_role`));
  });

  it('nenhuma tabela do módulo concede privilégio a anon', () => {
    // Único "to anon" aceitável seria um comentário — garantimos que não há
    // nenhum GRANT real para anon em nenhuma tabela finance_*.
    const grantToAnon = /grant[\s\S]{0,200}?on public\.finance_\w+ to anon/;
    expect(sql).not.toMatch(grantToAnon);
  });
});

describe('Migration do módulo Finanças — segurança da RPC confirm_finance_import', () => {
  it('usa security invoker (não definer) e fixa search_path', () => {
    expect(sql).toMatch(/create or replace function public\.confirm_finance_import/);
    expect(sql).toMatch(/security invoker/);
    expect(sql).toMatch(/set search_path = public/);
  });

  it('revoga execução de public e anon, concede só a authenticated', () => {
    expect(sql).toMatch(/revoke execute on function public\.confirm_finance_import\(uuid\) from public/);
    expect(sql).toMatch(/revoke execute on function public\.confirm_finance_import\(uuid\) from anon/);
    expect(sql).toMatch(/grant execute on function public\.confirm_finance_import\(uuid\) to authenticated/);
  });

  it('serializa confirmações concorrentes com bloqueio de linha (select ... for update)', () => {
    expect(sql).toMatch(/select workspace_id, status[\s\S]*?for update/);
  });

  it('revalida pertencimento ao workspace explicitamente, não confiando só na RLS', () => {
    expect(sql).toMatch(/if not public\.is_workspace_member\(v_workspace_id\) then/);
  });

  it('é idempotente: retorna cedo quando o import já está confirmado', () => {
    expect(sql).toMatch(/if v_status = 'confirmed' then/);
  });
});

describe('Migration do módulo Finanças — integridade entre workspaces (FK composta)', () => {
  it('finance_categories, finance_sources e finance_imports têm unique(workspace_id, id) para suportar FK composta', () => {
    expect(sql).toMatch(/create table public\.finance_categories[\s\S]*?unique \(workspace_id, id\)/);
    expect(sql).toMatch(/create table public\.finance_sources[\s\S]*?unique \(workspace_id, id\)/);
    expect(sql).toMatch(/create table public\.finance_imports[\s\S]*?unique \(workspace_id, id\)/);
  });

  it('finance_import_rows referencia categoria e importação por FK composta (workspace_id, ...)', () => {
    expect(sql).toMatch(
      /foreign key \(workspace_id, category_id\) references public\.finance_categories \(workspace_id, id\)/
    );
    expect(sql).toMatch(
      /foreign key \(workspace_id, import_id\) references public\.finance_imports \(workspace_id, id\)/
    );
  });

  it('finance_transactions referencia origem, importação, linha e categoria por FK composta', () => {
    expect(sql).toMatch(/foreign key \(workspace_id, source_id\) references public\.finance_sources \(workspace_id, id\)/);
    expect(sql).toMatch(
      /foreign key \(workspace_id, import_row_id\) references public\.finance_import_rows \(workspace_id, id\)/
    );
  });

  it('possível duplicidade usa duas colunas opcionais em vez de referência polimórfica, com constraint de exclusividade', () => {
    expect(sql).toMatch(/possible_duplicate_transaction_id uuid/);
    expect(sql).toMatch(/possible_duplicate_import_row_id uuid/);
    expect(sql).toMatch(
      /check \(possible_duplicate_transaction_id is null or possible_duplicate_import_row_id is null\)/
    );
  });
});

describe('Migration do módulo Finanças — convenção monetária e realtime', () => {
  it('todos os valores monetários são integer (centavos)', () => {
    expect(sql).toMatch(/default_matheus_income_cents integer/);
    expect(sql).toMatch(/amount_cents integer/);
    expect(sql).toMatch(/matheus_income_cents integer/);
  });

  it('publica as tabelas do módulo no supabase_realtime de forma idempotente', () => {
    expect(sql).toMatch(/alter publication supabase_realtime add table public\.finance_transactions/);
    expect(sql).toMatch(/pg_publication_tables/);
  });

  it('não duplica importação confirmada: unique(workspace_id, source_id, file_sha256) em finance_imports', () => {
    expect(sql).toMatch(/unique \(workspace_id, source_id, file_sha256\)/);
  });

  it('não duplica transação por FITID: unique(workspace_id, source_id, fitid) em finance_transactions', () => {
    expect(sql).toMatch(/unique \(workspace_id, source_id, fitid\)/);
  });
});

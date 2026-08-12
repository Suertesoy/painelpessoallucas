// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 20260806100000_routine_role_assignments.sql apenas acrescenta duas colunas
 * nulas em workspace_settings (tabela já existente, com RLS/grants/realtime
 * configurados). Este teste garante que a migration é aditiva, posterior a
 * todas as demais, e não duplica RLS/GRANT (que não são necessários para
 * uma coluna nova numa tabela já publicada).
 */

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase', 'migrations');
const FILE_NAME = '20260806100000_routine_role_assignments.sql';

describe('Migration de atribuição de projeto aos papéis da rotina', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, FILE_NAME), 'utf8').toLowerCase();

  // Compara com a migration de quem depende estruturalmente (criou
  // workspace_settings), não com "todas" — isso evitaria falso-negativo
  // inevitável quando uma migration futura for adicionada depois desta.
  it('é posterior à migration que criou workspace_settings, de quem depende', () => {
    const allFiles = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const dependency = allFiles.find((f) => f.includes('digest_settings'));
    expect(dependency).toBeDefined();
    expect(FILE_NAME > dependency!).toBe(true);
  });

  it('acrescenta as duas colunas em workspace_settings, nulas por padrão', () => {
    expect(sql).toMatch(/alter table public\.workspace_settings/);
    expect(sql).toMatch(/add column routine_primary_project_id uuid references public\.projects/);
    expect(sql).toMatch(/add column routine_secondary_project_id uuid references public\.projects/);
    expect(sql).not.toMatch(/not null/);
  });

  it('referencia projects com on delete set null (nunca cascade sobre workspace_settings)', () => {
    const occurrences = sql.match(/on delete set null/g) ?? [];
    expect(occurrences.length).toBe(2);
  });

  it('não cria tabela nova, GRANT ou policy (reaproveita workspace_settings existente)', () => {
    expect(sql).not.toMatch(/create table/);
    expect(sql).not.toMatch(/create policy/);
    expect(sql).not.toMatch(/\bgrant\b/);
  });
});

// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 20260731100000_shopping_lists.sql criou a tabela, RLS e policies, mas
 * nunca concedeu os privilégios de PostgreSQL (GRANT) que authenticated
 * precisa — sem eles, o Postgres nega o acesso antes mesmo de avaliar
 * qualquer policy, produzindo "permission denied for table shopping_lists".
 * 20260731110000_shopping_lists_grants.sql corrige isso; este teste garante
 * que a migration corretiva realmente contém os grants esperados (mesmo
 * padrão de 20260722140000_api_role_grants.sql) e não concede nada a anon.
 */

const MIGRATION_PATH = join(
  __dirname,
  '..',
  '..',
  'supabase',
  'migrations',
  '20260731110000_shopping_lists_grants.sql'
);

describe('Migration corretiva de grants de shopping_lists', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8').toLowerCase();

  it('concede select/insert/update/delete a authenticated em shopping_lists', () => {
    expect(sql).toMatch(
      /grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+public\.shopping_lists\s+to\s+authenticated/
    );
  });

  it('concede privilégios a service_role em shopping_lists', () => {
    expect(sql).toMatch(/grant\s+select,\s*insert,\s*update\s+on\s+public\.shopping_lists\s+to\s+service_role/);
  });

  it('não concede nenhum privilégio a anon', () => {
    expect(sql).not.toMatch(/to\s+anon/);
  });

  it('é posterior à migration que criou a tabela (não altera a já publicada retroativamente)', () => {
    const tableMigration = '20260731100000_shopping_lists.sql';
    const grantsMigration = '20260731110000_shopping_lists_grants.sql';
    expect(grantsMigration > tableMigration).toBe(true);
  });
});

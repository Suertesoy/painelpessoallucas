// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Verificações estáticas da migration de exclusão permanente de projeto
 * (mesmo padrão de `finance-grants-migration.test.ts`): RPC transacional
 * segura (invoker, search_path fixo, revoke de public/anon), guarda de
 * "só projeto arquivado", e — o ponto crítico — corrige `plan_actions`
 * ANTES do delete, para nunca violar
 * `plan_actions_project_assignment_consistency`.
 */

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase', 'migrations');
const MIGRATION_FILE = '20260805130000_project_hard_delete.sql';
const sql = readFileSync(join(MIGRATIONS_DIR, MIGRATION_FILE), 'utf8').toLowerCase();

describe('Migration de exclusão permanente de projeto — ordem no histórico', () => {
  // Compara só com as migrations que já existiam quando esta foi escrita (não
  // com "todas", que cresce a cada feature nova e tornaria este teste
  // inevitavelmente falso mais tarde) — a garantia real é não preceder
  // `plan_action_project_assignment`, de quem depende estruturalmente.
  it('é posterior à migration de plan_action_project_assignment, de quem depende', () => {
    const allMigrations = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const dependency = allMigrations.find((f) => f.includes('plan_action_project_assignment'));
    expect(dependency).toBeDefined();
    expect(MIGRATION_FILE > dependency!).toBe(true);
  });
});

describe('Migration de exclusão permanente de projeto — segurança da RPC', () => {
  it('usa security invoker (não definer) e fixa search_path', () => {
    expect(sql).toMatch(/create or replace function public\.delete_project_permanently/);
    expect(sql).toMatch(/security invoker/);
    expect(sql).toMatch(/set search_path = public/);
  });

  it('revoga execução de public e anon, concede só a authenticated', () => {
    expect(sql).toMatch(/revoke execute on function public\.delete_project_permanently\(uuid\) from public/);
    expect(sql).toMatch(/revoke execute on function public\.delete_project_permanently\(uuid\) from anon/);
    expect(sql).toMatch(/grant execute on function public\.delete_project_permanently\(uuid\) to authenticated/);
  });

  it('trava a linha do projeto contra chamadas concorrentes (select ... for update)', () => {
    expect(sql).toMatch(/select workspace_id, status, name[\s\S]*?for update/);
  });

  it('revalida pertencimento ao workspace explicitamente, não confiando só na RLS', () => {
    expect(sql).toMatch(/if not public\.is_workspace_member\(v_workspace_id\) then/);
  });

  it('rejeita excluir um projeto que não está arquivado', () => {
    expect(sql).toMatch(/if v_status <> 'archived' then/);
  });
});

describe('Migration de exclusão permanente de projeto — consistência de plan_actions', () => {
  it('corrige plan_actions (project_assignment=none, project_id=null) ANTES do delete de projects', () => {
    const updateIdx = sql.indexOf("update public.plan_actions");
    const deleteIdx = sql.indexOf('delete from public.projects');
    expect(updateIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeLessThan(deleteIdx);
  });

  it("seta project_assignment = 'none' e project_id = null para plan_actions do projeto excluído", () => {
    expect(sql).toMatch(/set project_assignment = 'none',\s*project_id = null\s*where project_id = p_project_id/);
  });

  it('registra o evento de auditoria antes de apagar a linha do projeto', () => {
    const insertIdx = sql.indexOf('insert into public.domain_events');
    const deleteIdx = sql.indexOf('delete from public.projects');
    expect(insertIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeLessThan(deleteIdx);
    expect(sql).toMatch(/'project\.deleted_permanently'/);
  });
});

// Validação local (PGlite) da migration 20261017100000_finance_card_goals.sql.
// Uso: node supabase/tests/validate-card-goals-migration.mjs <pasta-do-pglite> supabase/migrations
//
// Prova: aplica sobre o schema real de Finanças sem alterar nada existente, nasce
// vazia, RLS por workspace (Lucas e Matheus na mesma casa enxergam/editam a mesma
// meta; terceiro e outra casa não), unicidade, checagens de valor/mês, upsert como
// o app faz, realtime e idempotência. LIMITES: não prova PostgREST nem o Realtime real.
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [envDir, migDir] = process.argv.slice(2);
const pg = await import(pathToFileURL(join(envDir, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new pg.PGlite();

let failed = 0;
function check(name, cond, detail = '') {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + detail}`);
}
async function expectError(name, sqlText, pattern) {
  try {
    await db.exec(sqlText);
    check(name, false, 'não deu erro');
  } catch (e) {
    const ok = pattern instanceof RegExp ? pattern.test(e.message) || pattern.test(e.code ?? '') : (e.code ?? '') === pattern;
    check(name, ok, `veio ${e.code ?? ''} ${e.message}`);
  }
}
const val = async (q) => Object.values((await db.query(q)).rows[0] ?? {})[0];
const as = async (uid, role = 'authenticated') => {
  await db.exec(`reset role; select set_config('request.jwt.claims', '${JSON.stringify({ sub: uid, role })}', false); set role ${role};`);
};
const asNone = async () => { await db.exec('reset role;'); };

const L = '11111111-1111-4111-8111-111111111111'; // Lucas
const M = '22222222-2222-4222-8222-222222222222'; // Matheus
const A = '33333333-3333-4333-8333-333333333333'; // terceiro

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz default now(), raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(coalesce(current_setting('request.jwt.claim.sub', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  create publication supabase_realtime;
`);

const apply = async (f) => {
  const sql = readFileSync(join(migDir, f), 'utf8').replace(/create extension if not exists "pgcrypto";/g, '');
  try {
    await db.exec(sql);
    check(`migration aplica sem erro: ${f}`, true);
  } catch (e) {
    check(`migration aplica sem erro: ${f}`, false, e.message);
    console.log('ABORTADO.');
    process.exit(2);
  }
};

for (const f of [
  '20260716120000_core_schema.sql',
  '20260722150000_workspace_function_grants.sql',
  '20260815100000_finance_cash_core.sql',
  '20260816100000_finance_categories_fixed_incomes.sql',
  '20260819100000_finance_expenses.sql',
]) await apply(f);
await db.exec(`
  grant select on public.workspace_members, public.workspaces to authenticated;
  insert into auth.users (id, email) values ('${L}', 'lucas@example.com'), ('${M}', 'matheus@example.com'), ('${A}', 'amigo@example.com');
`);
const WL = await val(`select workspace_id from workspace_members where user_id = '${L}'`);
const WA = await val(`select workspace_id from workspace_members where user_id = '${A}'`);
// Matheus entra na casa do Lucas (como o convite aceito faz): membro do mesmo workspace.
await db.exec(`insert into workspace_members (workspace_id, user_id, role) values ('${WL}', '${M}', 'member')`);

// Dados financeiros reais do Lucas ANTES da migration: precisam ficar idênticos.
await db.exec(`
  insert into finance_balance (workspace_id, available_cents, reserve_cents) values ('${WL}', 123456, 900000);
  insert into finance_card_invoices (workspace_id, card, month, status, imported_amount_cents, due_date) values ('${WL}', 'nubank_2', '2026-07', 'open', 626512, '2026-07-10');
`);
const snap = async () => await val(`select md5(coalesce((select string_agg(b::text, '|') from finance_balance b), '') || coalesce((select string_agg(i::text, '|' order by id) from finance_card_invoices i), ''))`);
const before = await snap();

await apply('20261017100000_finance_card_goals.sql');

check('dados financeiros existentes idênticos após a migration', before === (await snap()));
check('a tabela nasce vazia (nenhuma meta inventada)', Number(await val('select count(*) from finance_card_goals')) === 0);

// Lucas define a meta padrão e uma exceção, como o app faz (upsert por chave única).
await as(L);
await db.exec(`insert into finance_card_goals (workspace_id, scope, month, amount_cents) values ('${WL}', 'default', '2026-10', 500000)`);
await db.exec(`insert into finance_card_goals (workspace_id, scope, month, amount_cents) values ('${WL}', 'month', '2026-12', 800000)`);
check('updated_by registra quem definiu (auth.uid)', (await val(`select updated_by from finance_card_goals where scope = 'default'`)) === L);
await asNone();

// Matheus (mesma casa) vê as mesmas metas e pode editar.
await as(M);
check('Matheus vê as mesmas metas da casa', Number(await val('select count(*) from finance_card_goals')) === 2);
await db.exec(`insert into finance_card_goals (workspace_id, scope, month, amount_cents) values ('${WL}', 'default', '2026-10', 550000)
  on conflict (workspace_id, scope, month) do update set amount_cents = excluded.amount_cents`);
check('upsert da meta padrão atualiza (não duplica)', Number(await val(`select count(*) from finance_card_goals where scope = 'default'`)) === 1
  && Number(await val(`select amount_cents from finance_card_goals where scope = 'default'`)) === 550000);
check('updated_at acompanha a edição (trigger)', (await val(`select updated_at >= created_at from finance_card_goals where scope = 'default'`)) === true);
await db.exec(`delete from finance_card_goals where scope = 'month' and month = '2026-12'`);
check('exceção mensal pode ser removida (volta à meta padrão)', Number(await val('select count(*) from finance_card_goals')) === 1);
await asNone();

// Terceiro e outra casa: isolamento.
await as(A);
check('terceiro NÃO enxerga as metas da casa', Number(await val('select count(*) from finance_card_goals')) === 0);
await expectError('terceiro NÃO cria meta na casa alheia', `insert into finance_card_goals (workspace_id, scope, month, amount_cents) values ('${WL}', 'default', '2026-11', 1)`, /row-level security|42501/);
await db.exec(`insert into finance_card_goals (workspace_id, scope, month, amount_cents) values ('${WA}', 'default', '2026-10', 100000)`);
check('terceiro cria a meta da própria casa', Number(await val('select count(*) from finance_card_goals')) === 1);
await asNone();
await as(L);
check('Lucas não enxerga a meta da outra casa', Number(await val(`select count(*) from finance_card_goals where workspace_id = '${WA}'`)) === 0);
const upd = await db.query(`update finance_card_goals set amount_cents = 1 where workspace_id = '${WA}' returning id`);
check('Lucas não altera a meta da outra casa', upd.rows.length === 0);
const del = await db.query(`delete from finance_card_goals where workspace_id = '${WA}' returning id`);
check('Lucas não remove a meta da outra casa', del.rows.length === 0);
await asNone();

// Restrições de integridade.
await as(L);
await expectError('valor zero é recusado', `insert into finance_card_goals (workspace_id, scope, month, amount_cents) values ('${WL}', 'month', '2026-11', 0)`, /check|23514/);
await expectError('valor negativo é recusado', `insert into finance_card_goals (workspace_id, scope, month, amount_cents) values ('${WL}', 'month', '2026-11', -5)`, /check|23514/);
await expectError('mês inválido é recusado', `insert into finance_card_goals (workspace_id, scope, month, amount_cents) values ('${WL}', 'month', '2026-13', 100)`, /check|23514/);
await expectError('escopo inválido é recusado', `insert into finance_card_goals (workspace_id, scope, month, amount_cents) values ('${WL}', 'forever', '2026-11', 100)`, /check|23514/);
await expectError('duas metas iguais no mesmo escopo/mês são recusadas', `insert into finance_card_goals (workspace_id, scope, month, amount_cents) values ('${WL}', 'default', '2026-10', 100)`, /unique|23505/);
await asNone();

// Realtime e idempotência.
const published = (await db.query(`select tablename from pg_publication_tables where pubname = 'supabase_realtime'`)).rows.map((r) => r.tablename);
check('publicada no Realtime', published.includes('finance_card_goals'));
try {
  await db.exec(`do $$ begin if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'finance_card_goals') then alter publication supabase_realtime add table public.finance_card_goals; end if; end $$;`);
  check('bloco de Realtime é idempotente (segunda execução sem erro)', true);
} catch (e) {
  check('bloco de Realtime é idempotente (segunda execução sem erro)', false, e.message);
}
const grants = (await db.query(`select privilege_type from information_schema.role_table_grants where table_name = 'finance_card_goals' and grantee = 'authenticated'`)).rows.map((r) => r.privilege_type);
check('authenticated tem select/insert/update/delete', ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].every((p) => grants.includes(p)));
check('anon NÃO tem acesso', (await db.query(`select 1 from information_schema.role_table_grants where table_name = 'finance_card_goals' and grantee = 'anon'`)).rows.length === 0);

console.log(failed === 0 ? '\nTODAS as verificações passaram.' : `\n${failed} verificação(ões) FALHARAM.`);
process.exit(failed === 0 ? 0 : 1);

// Validação, em Postgres embutido (PGlite), das migrations da rodada Nossa Casa:
// convites/workspace compartilhado, Estudos (pausas, prática, dono do curso),
// Treinos, Realtime e exclusão de categorias. Local, gratuito e descartável.
//
// Preparo (uma vez, FORA do projeto): npm install @electric-sql/pglite --prefix <pasta>
// Uso: node supabase/tests/validate-round-migrations.mjs <pasta-do-pglite> supabase/migrations
//
// LIMITES (o que o PGlite NÃO prova): Supabase Auth real (login Google, e-mail
// confirmado de verdade, JWT), PostgREST (como o app chama as tabelas), Realtime
// (entrega de eventos entre aparelhos) e o schema real de produção. Aqui, auth.users/
// auth.uid() são simulados e `supabase_realtime` é uma publicação vazia.
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
const rows = async (q) => (await db.query(q)).rows;

const L = '11111111-1111-4111-8111-111111111111'; // Lucas (administra a casa)
const M = '22222222-2222-4222-8222-222222222222'; // Matheus (conta Google própria)
const A = '33333333-3333-4333-8333-333333333333'; // terceiro (amigo; não faz parte da casa)

const as = async (uid, role = 'authenticated') => {
  await db.exec(`reset role; select set_config('request.jwt.claims', '${JSON.stringify({ sub: uid, role })}', false); set role ${role};`);
};
const asNone = async () => { await db.exec('reset role;'); };

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

const apply = async (f, mutate = (s) => s) => {
  const sql = mutate(readFileSync(join(migDir, f), 'utf8')).replace(/create extension if not exists "pgcrypto";/g, '');
  try {
    await db.exec(sql);
    check(`migration aplica sem erro: ${f}`, true);
  } catch (e) {
    check(`migration aplica sem erro: ${f}`, false, e.message);
    console.log('ABORTADO.');
    process.exit(2);
  }
};

/* ------------------------------------------------ base como está em produção hoje */
for (const f of [
  '20260716120000_core_schema.sql',
  '20260722150000_workspace_function_grants.sql',
  '20260728130000_learning_engine.sql',
  '20260815100000_finance_cash_core.sql',
  '20260816100000_finance_categories_fixed_incomes.sql',
  '20260818100000_finance_category_learning.sql',
  '20260819100000_finance_expenses.sql',
]) await apply(f);
await db.exec(`
  grant select, insert, update, delete on public.items, public.projects to authenticated;
  grant select on public.workspace_members, public.workspaces to authenticated;
  grant select, update on public.profiles to authenticated;
`);

await db.exec(`insert into auth.users (id, email) values ('${L}', 'lucas@example.com'), ('${M}', 'matheus@example.com'), ('${A}', 'amigo@example.com')`);
const WL = await val(`select workspace_id from workspace_members where user_id = '${L}'`);
const WM = await val(`select workspace_id from workspace_members where user_id = '${M}'`);
const WA = await val(`select workspace_id from workspace_members where user_id = '${A}'`);
check('cada pessoa nasce com o próprio workspace pessoal', new Set([WL, WM, WA]).size === 3);

// Dados "de produção" do Lucas ANTES da rodada, para provar que nada é alterado.
await db.exec(`
  insert into learning_courses (id, workspace_id, slug, title) values ('c0000000-0000-4000-8000-000000000001', '${WL}', 'japones', 'Japonês');
  insert into learning_modules (id, workspace_id, course_id, title, position) values ('a0000000-0000-4000-8000-000000000001', '${WL}', 'c0000000-0000-4000-8000-000000000001', 'Fundamentos', 0);
  insert into study_sessions (id, workspace_id, course_id, started_at, ended_at, duration_minutes, status, daily_goal_minutes_snapshot) values
    ('50000000-0000-4000-8000-000000000001', '${WL}', 'c0000000-0000-4000-8000-000000000001', '2026-10-10T12:00:00Z', '2026-10-10T12:20:00Z', 20, 'completed', 15);
  insert into items (id, workspace_id, title, type, status, created_by) values ('11000000-0000-4000-8000-000000000001', '${WL}', 'Comprar café', 'task', 'inbox', '${L}');
  insert into items (id, workspace_id, title, type, status, created_by) values ('11000000-0000-4000-8000-000000000002', '${WM}', 'Nota antiga do Matheus', 'note', 'inbox', '${M}');
`);
const snapshot = async () => ({
  courses: await val(`select md5(string_agg(c::text, '|' order by id)) from (select id, workspace_id, slug, title, status, daily_goal_minutes from learning_courses) c`),
  sessions: await val(`select md5(string_agg(s::text, '|' order by id)) from (select id, workspace_id, course_id, started_at, ended_at, duration_minutes, status from study_sessions) s`),
  items: await val(`select md5(string_agg(i::text, '|' order by id)) from (select id, workspace_id, title, status from items) i`),
});
const before = await snapshot();

/* ------------------------------------------------ migrations da rodada, na ordem */
for (const f of [
  '20261015090000_workspace_invites.sql',
  '20261015100000_estudos_sessions_practice.sql',
  '20261015110000_workouts.sql',
  '20261015120000_learning_course_owner.sql',
  '20261015130000_realtime_finance_categories_expenses.sql',
  '20261015140000_finance_balance_concurrency.sql',
]) await apply(f);

const after = await snapshot();
check('dados existentes (cursos, sessões, itens) idênticos após as migrations', JSON.stringify(before) === JSON.stringify(after));
check('sessão antiga ganha defaults seguros (pausa 0, sem active_seconds)',
  (await val(`select paused_total_seconds from study_sessions where id = '50000000-0000-4000-8000-000000000001'`)) === 0 &&
  (await val(`select active_seconds is null and paused_at is null from study_sessions where id = '50000000-0000-4000-8000-000000000001'`)) === true);
check('curso antigo continua SEM dono (nenhuma reatribuição automática)', (await val(`select owner_user_id is null from learning_courses where id = 'c0000000-0000-4000-8000-000000000001'`)) === true);

/* ------------------------------------------------ convite e workspace compartilhado */
await as(L);
const token = await val(`select create_workspace_invite('${WL}', '  Matheus@Example.com ')`);
check('Lucas (owner) cria convite e recebe o token em claro uma vez', typeof token === 'string' && token.length >= 60);
await expectError('authenticated NÃO lê a tabela de convites (sem grant)', `select * from workspace_invites`, '42501');
await asNone();
const stored = await rows(`select email, token_hash from workspace_invites`);
check('só o hash do token fica no banco; e-mail normalizado', stored.length === 1 && stored[0].email === 'matheus@example.com' && !stored[0].token_hash.includes(token) && stored[0].token_hash.length === 64);

await as(M);
await expectError('Matheus NÃO cria convite para o workspace do Lucas (não é membro/owner)', `select create_workspace_invite('${WL}', 'x@example.com')`, /Apenas quem administra/);
await expectError('Matheus NÃO lê itens do workspace do Lucas antes de aceitar', `select 1/(count(*))::int from items where workspace_id = '${WL}'`, /division by zero/);
await asNone();

await as(A);
await expectError('terceiro com o token (e-mail diferente) é recusado', `select accept_workspace_invite('${token}')`, /Convite inválido ou expirado/);
await asNone();
check('terceiro continua fora do workspace da casa', (await val(`select count(*) from workspace_members where workspace_id = '${WL}' and user_id = '${A}'`)) === 0);

await db.exec(`update auth.users set email_confirmed_at = null where id = '${M}'`);
await as(M);
await expectError('e-mail NÃO confirmado não aceita o convite', `select accept_workspace_invite('${token}')`, /Convite inválido ou expirado/);
await asNone();
await db.exec(`update auth.users set email_confirmed_at = now() where id = '${M}'`);

await db.exec(`update workspace_invites set expires_at = now() - interval '1 minute'`);
await as(M);
await expectError('convite expirado é recusado', `select accept_workspace_invite('${token}')`, /Convite inválido ou expirado/);
await asNone();
await db.exec(`update workspace_invites set expires_at = now() + interval '7 days'`);

await as(M);
const joined = await val(`select accept_workspace_invite('${token}')`);
check('Matheus aceita com a própria conta e entra no workspace da casa', joined === WL);
check('Matheus vira "member" (sem hierarquia complicada: acessa e edita tudo)', (await val(`select role from workspace_members where workspace_id = '${WL}' and user_id = '${M}'`)) === 'member');
check('o workspace padrão do Matheus passa a ser o da casa', (await val(`select ensure_personal_workspace()`)) === WL);
await expectError('token de uso único: segunda tentativa falha', `select accept_workspace_invite('${token}')`, /Convite inválido ou expirado/);
await asNone();
check('workspace pessoal do Matheus NÃO é apagado nem mesclado (dados intactos)',
  (await val(`select count(*) from workspaces where id = '${WM}'`)) === 1 &&
  (await val(`select count(*) from items where workspace_id = '${WM}'`)) === 1 &&
  (await val(`select count(*) from workspace_members where workspace_id = '${WM}' and user_id = '${M}'`)) === 1);

await as(L);
await expectError('limite de 2 pessoas: nenhum terceiro pode ser convidado', `select create_workspace_invite('${WL}', 'amigo@example.com')`, /máximo de 2 pessoas/);
const memberRows = await rows(`select email, role from list_workspace_members('${WL}') order by role`);
check('lista de participantes mostra Lucas (owner) e Matheus', memberRows.length === 2 && memberRows.some((r) => r.role === 'owner'));
await asNone();
await as(A);
await expectError('terceiro NÃO lista participantes da casa', `select * from list_workspace_members('${WL}')`, /Sem acesso/);
check('terceiro NÃO enxerga itens da casa (RLS)', (await val(`select count(*) from items where workspace_id = '${WL}'`)) === 0);
await asNone();

/* revogação */
// Revogação: remove Matheus da casa (como administrador de banco) e testa um novo convite revogado.
await db.exec(`delete from workspace_members where workspace_id = '${WL}' and user_id = '${M}'`);
await as(L);
const t2 = await val(`select create_workspace_invite('${WL}', 'matheus@example.com')`);
const inviteId = await val(`select id from list_workspace_invites('${WL}') limit 1`);
await db.exec(`select revoke_workspace_invite('${inviteId}')`);
await asNone();
await as(M);
await expectError('convite revogado deixa de valer', `select accept_workspace_invite('${t2}')`, /Convite inválido ou expirado/);
await asNone();
// Reentrada para os próximos testes
await as(L);
const t3 = await val(`select create_workspace_invite('${WL}', 'matheus@example.com')`);
await asNone();
await as(M);
await db.exec(`select accept_workspace_invite('${t3}')`);
await asNone();

/* ------------------------------------------------ uso simultâneo no mesmo workspace */
await as(M);
await db.exec(`insert into items (id, workspace_id, title, type, status, created_by) values ('11000000-0000-4000-8000-000000000003', '${WL}', 'Leite (Matheus)', 'task', 'inbox', '${M}')`);
await asNone();
await as(L);
check('Lucas vê o que Matheus cadastrou', (await val(`select count(*) from items where workspace_id = '${WL}' and title = 'Leite (Matheus)'`)) === 1);
await db.exec(`update items set status = 'completed' where id = '11000000-0000-4000-8000-000000000003'`);
await asNone();
await as(M);
check('Matheus vê a alteração do Lucas', (await val(`select status from items where id = '11000000-0000-4000-8000-000000000003'`)) === 'completed');
await db.exec(`delete from items where id = '11000000-0000-4000-8000-000000000003'`);
await asNone();
check('ambos podem excluir dados domésticos', (await val(`select count(*) from items where id = '11000000-0000-4000-8000-000000000003'`)) === 0);

/* ------------------------------------------------ Estudos individuais */
const JP = 'c0000000-0000-4000-8000-000000000001';
const EN = 'c0000000-0000-4000-8000-000000000002';
await as(M);
await db.exec(`insert into learning_courses (id, workspace_id, slug, title, owner_user_id) values ('${EN}', '${WL}', 'ingles', 'Inglês', '${M}')`);
await db.exec(`insert into study_sessions (id, workspace_id, course_id, status, daily_goal_minutes_snapshot) values ('50000000-0000-4000-8000-0000000000e1', '${WL}', '${EN}', 'in_progress', 15)`);
await asNone();
await as(L);
await db.exec(`insert into study_sessions (id, workspace_id, course_id, status, daily_goal_minutes_snapshot) values ('50000000-0000-4000-8000-0000000000a1', '${WL}', '${JP}', 'in_progress', 15)`);
check('Lucas e Matheus estudam AO MESMO TEMPO (uma sessão ativa por curso)', (await val(`select count(*) from study_sessions where status = 'in_progress'`)) === 2);
await expectError('duas sessões ativas no MESMO curso continuam proibidas', `insert into study_sessions (workspace_id, course_id, status, daily_goal_minutes_snapshot) values ('${WL}', '${JP}', 'in_progress', 15)`, '23505');
await db.exec(`update study_sessions set paused_at = now(), paused_total_seconds = 30 where id = '50000000-0000-4000-8000-0000000000a1'`);
await expectError('pausa negativa é recusada', `update study_sessions set paused_total_seconds = -1 where id = '50000000-0000-4000-8000-0000000000a1'`, '23514');
await db.exec(`update study_sessions set status = 'completed', ended_at = now(), duration_minutes = 1, active_seconds = 20, paused_at = null where id = '50000000-0000-4000-8000-0000000000a1'`);
check('sessão pausada/encerrada grava active_seconds', (await val(`select active_seconds from study_sessions where id = '50000000-0000-4000-8000-0000000000a1'`)) === 20);
await asNone();

await as(L);
await db.exec(`insert into learning_practice_items (workspace_id, course_id, kind, subject, due_on) values ('${WL}', '${JP}', 'kana_read', 'あ', '2026-10-16')`);
await expectError('prática: mesmo item duas vezes é recusado', `insert into learning_practice_items (workspace_id, course_id, kind, subject, due_on) values ('${WL}', '${JP}', 'kana_read', 'あ', '2026-10-16')`, '23505');
await expectError('prática: caixa fora de 0–4 é recusada', `update learning_practice_items set box = 9`, '23514');
await asNone();
await as(A);
check('terceiro NÃO enxerga a prática nem os cursos', (await val(`select count(*) from learning_practice_items`)) === 0 && (await val(`select count(*) from learning_courses where workspace_id = '${WL}'`)) === 0);
await asNone();

/* ------------------------------------------------ Treinos */
await as(L);
await db.exec(`
  insert into workout_athletes (id, workspace_id, name, position) values
    ('a1000000-0000-4000-8000-000000000001', '${WL}', 'Lucas', 0),
    ('a1000000-0000-4000-8000-000000000002', '${WL}', 'Matheus', 1);
  insert into workout_days (id, workspace_id, code, position) values ('d1000000-0000-4000-8000-000000000001', '${WL}', 'A', 0);
  insert into workout_exercises (id, workspace_id, day_id, position, name, sets) values
    ('e1000000-0000-4000-8000-000000000001', '${WL}', 'd1000000-0000-4000-8000-000000000001', 0, 'Leg 45', 3);
  insert into workout_exercise_loads (workspace_id, exercise_id, athlete_id, load_kg) values
    ('${WL}', 'e1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 70),
    ('${WL}', 'e1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 70);
`);
await expectError('atleta duplicado no workspace é recusado', `insert into workout_athletes (workspace_id, name) values ('${WL}', 'Lucas')`, '23505');
await db.exec(`insert into workout_sessions (id, workspace_id, athlete_id, day_id, session_date) values ('51000000-0000-4000-8000-000000000001', '${WL}', 'a1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', '2026-10-15')`);
await asNone();
await as(M);
await db.exec(`insert into workout_sessions (id, workspace_id, athlete_id, day_id, session_date) values ('51000000-0000-4000-8000-000000000002', '${WL}', 'a1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', '2026-10-15')`);
check('os dois treinam ao mesmo tempo (um treino ativo por atleta)', (await val(`select count(*) from workout_sessions where status = 'in_progress'`)) === 2);
await expectError('segundo treino ativo do mesmo atleta é recusado', `insert into workout_sessions (workspace_id, athlete_id, day_id, session_date) values ('${WL}', 'a1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', '2026-10-15')`, '23505');
await db.exec(`insert into workout_set_logs (workspace_id, session_id, athlete_id, exercise_id, set_number, load_kg, reps) values ('${WL}', '51000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 1, 72.5, 10)`);
await expectError('série repetida (sessão, exercício, nº) é recusada', `insert into workout_set_logs (workspace_id, session_id, athlete_id, exercise_id, set_number, reps) values ('${WL}', '51000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 1, 8)`, '23505');
await expectError('repetições negativas são recusadas', `insert into workout_set_logs (workspace_id, session_id, athlete_id, exercise_id, set_number, reps) values ('${WL}', '51000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 2, -1)`, '23514');
await db.exec(`update workout_sessions set rest_ends_at = now() + interval '90 seconds', rest_duration_seconds = 90 where id = '51000000-0000-4000-8000-000000000002'`);
await db.exec(`update workout_exercises set hidden_at = now() where id = 'e1000000-0000-4000-8000-000000000001'`);
check('ocultar exercício não apaga séries nem cargas (histórico preservado)',
  (await val(`select count(*) from workout_set_logs`)) === 1 && (await val(`select count(*) from workout_exercise_loads`)) === 2);
await db.exec(`update workout_exercises set hidden_at = null where id = 'e1000000-0000-4000-8000-000000000001'`);
check('reexibir devolve o exercício (hidden_at nulo)', (await val(`select hidden_at is null from workout_exercises`)) === true);
await db.exec(`insert into workout_body_weights (workspace_id, athlete_id, weight_kg, logged_on) values ('${WL}', 'a1000000-0000-4000-8000-000000000002', 82.4, '2026-10-15')`);
await expectError('um peso por atleta por dia', `insert into workout_body_weights (workspace_id, athlete_id, weight_kg, logged_on) values ('${WL}', 'a1000000-0000-4000-8000-000000000002', 82.0, '2026-10-15')`, '23505');
await expectError('peso fora da faixa (5 kg) é recusado', `insert into workout_body_weights (workspace_id, athlete_id, weight_kg, logged_on) values ('${WL}', 'a1000000-0000-4000-8000-000000000001', 5, '2026-10-16')`, '23514');
await asNone();
await as(L);
check('históricos separados por atleta (Lucas não tem a série do Matheus)', (await val(`select count(*) from workout_set_logs where athlete_id = 'a1000000-0000-4000-8000-000000000001'`)) === 0);
await asNone();
await as(A);
check('terceiro NÃO enxerga treinos da casa', (await val(`select count(*) from workout_sessions`)) === 0 && (await val(`select count(*) from workout_athletes`)) === 0);
await expectError('terceiro NÃO registra série na casa', `insert into workout_set_logs (workspace_id, session_id, athlete_id, exercise_id, set_number, reps) values ('${WL}', '51000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 5, 5)`, '42501');
await asNone();
check('anon sem privilégio nas tabelas de treino/estudo', (await val(`select bool_or(has_table_privilege('anon', t, 'select')) from unnest(array['public.workout_sessions','public.workout_set_logs','public.learning_practice_items','public.workspace_invites']) t`)) === false);

/* ------------------------------------------------ exclusão de categorias (replay do fluxo do app) */
const DEFAULTS = [['groceries', 'Mercado'], ['restaurants', 'Restaurantes e delivery'], ['other', 'Outros']];
await db.exec(`insert into finance_item_categories (workspace_id, id, label, sort_order) values ${DEFAULTS.map(([id, label], i) => `('${WL}', '${id}', '${label}', ${i})`).join(',')}, ('${WL}', 'delivery', 'Delivery', 9)`);
await db.exec(`
  insert into finance_card_invoices (id, workspace_id, card, month, status, imported_amount_cents, rev) values ('aaaaaaaa-0000-4000-8000-000000000001', '${WL}', 'nubank_1', '2026-10', 'open', 10000, 1);
  insert into finance_invoice_imports (id, workspace_id, invoice_id, request_id, file_name, file_sha256) values ('bbbbbbbb-0000-4000-8000-000000000001', '${WL}', 'aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'f.csv', 'abc');
  insert into finance_invoice_items (id, workspace_id, invoice_id, first_import_id, last_import_id, purchase_date, description, normalized_description, amount_cents, kind, base_description, category, category_source) values
    ('dddddddd-0000-4000-8000-000000000001', '${WL}', 'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', '2026-10-05', 'IFOOD', 'ifood', 4590, 'purchase', 'ifood', 'delivery', 'user'),
    ('dddddddd-0000-4000-8000-000000000002', '${WL}', 'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', '2026-10-06', 'PADARIA', 'padaria', 1200, 'purchase', 'padaria', 'groceries', 'user');
  insert into finance_expenses (id, workspace_id, description, amount_cents, spent_on, payment_method, category) values ('eeeeeeee-0000-4000-8000-000000000001', '${WL}', 'Pizza', 7000, '2026-10-07', 'pix', 'delivery');
  insert into finance_commitments (id, workspace_id, description, amount_cents, recurrence, day_of_month, start_month, category) values ('ffffffff-0000-4000-8000-000000000001', '${WL}', 'Clube do vinho', 9900, 'monthly', 5, '2026-10', 'delivery');
  insert into finance_category_rules (workspace_id, merchant_key, category) values ('${WL}', 'ifood', 'delivery');
`);
const money = () => val(`select md5((select string_agg(amount_cents::text||purchase_date::text, '|' order by id) from finance_invoice_items) || (select string_agg(amount_cents::text||spent_on::text, '|' order by id) from finance_expenses) || (select string_agg(amount_cents::text||start_month, '|' order by id) from finance_commitments))`);
const m0 = await money();
await as(M); // Matheus exclui a categoria duplicada "Delivery" movendo para "Restaurantes e delivery"
await db.exec(`
  update finance_invoice_items set category = 'restaurants', category_source = 'user', category_rule_id = null where workspace_id = '${WL}' and category = 'delivery';
  update finance_expenses set category = 'restaurants' where workspace_id = '${WL}' and category = 'delivery';
  update finance_commitments set category = 'restaurants' where workspace_id = '${WL}' and category = 'delivery';
  update finance_category_rules set category = 'restaurants' where workspace_id = '${WL}' and category = 'delivery';
  delete from finance_item_categories where workspace_id = '${WL}' and id = 'delivery';
`);
await asNone();
check('excluir categoria duplicada com substituta: lançamentos/despesas/compromissos/regras migram', (await val(`select count(*) from finance_invoice_items where category = 'restaurants'`)) === 1 && (await val(`select category from finance_expenses`)) === 'restaurants' && (await val(`select category from finance_commitments`)) === 'restaurants' && (await val(`select category from finance_category_rules`)) === 'restaurants');
check('valores e datas intactos após a exclusão', (await money()) === m0);
check('nenhuma referência de categoria aponta para algo inexistente', (await val(`select count(*) from finance_invoice_items i where i.category is not null and not exists (select 1 from finance_item_categories c where c.workspace_id = i.workspace_id and c.id = i.category)`)) === 0);

await db.exec(`update finance_invoice_items set category = null, category_source = null, category_rule_id = null where category = 'groceries'; update finance_expenses set category = null where category = 'groceries'; update finance_commitments set category = null where category = 'groceries'; delete from finance_category_rules where category = 'groceries'; delete from finance_item_categories where id = 'groceries';`);
check('categoria do sistema (Mercado) também pode ser excluída, sem substituta: lançamentos ficam sem categoria', (await val(`select category is null from finance_invoice_items where id = 'dddddddd-0000-4000-8000-000000000002'`)) === true && (await money()) === m0);
await db.exec(`update finance_item_categories set label = 'Supermercado' where workspace_id = '${WL}' and id = 'restaurants'`);
check('vínculo sobrevive ao rename', (await val(`select count(*) from finance_invoice_items where category = 'restaurants'`)) === 1);

/* ------------------------------------------------ atualização perdida (dois aparelhos) */
// PGlite tem uma única conexão: simulamos o pior intercalamento (as duas telas leem a MESMA versão
// e gravam uma depois da outra). O bloqueio de linha (FOR UPDATE) que serializa gravações realmente
// simultâneas é propriedade do Postgres e NÃO é exercitado aqui.
await as(L);
await db.exec(`select finance_set_balance('${WL}', 100000, 5000)`);
const v1 = await val(`select updated_at from finance_balance where workspace_id = '${WL}'`);
await asNone();
await as(L);
await db.exec(`select finance_set_balance_checked('${WL}', 90000, null, '${v1.toISOString()}')`);
await asNone();
await as(M);
await expectError('saldo: segundo ajuste com a versão antiga é recusado (40001), não sobrescreve', `select finance_set_balance_checked('${WL}', 12345, null, '${v1.toISOString()}')`, '40001');
await asNone();
check('saldo: o valor do primeiro ajuste permanece', Number(await val(`select available_cents from finance_balance where workspace_id = '${WL}'`)) === 90000);
await as(M);
const v2 = await val(`select updated_at from finance_balance where workspace_id = '${WL}'`);
await db.exec(`select finance_set_balance_checked('${WL}', 91000, null, '${v2.toISOString()}')`);
check('saldo: com a versão atual o ajuste é aceito', Number(await val(`select available_cents from finance_balance where workspace_id = '${WL}'`)) === 91000);
await asNone();
// Um recebimento somado ao saldo no intervalo também invalida a tela antiga (versão = updated_at da linha).
await db.exec(`insert into finance_receivables (id, workspace_id, description, amount_cents, expected_date, status) values ('77000000-0000-4000-8000-000000000001', '${WL}', 'Freela', 20000, '2026-10-20', 'confirmed')`);
await as(L);
const v3 = await val(`select updated_at from finance_balance where workspace_id = '${WL}'`);
await asNone();
await as(M);
await db.exec(`select finance_mark_receivable_received('77000000-0000-4000-8000-000000000001', true)`);
await db.exec(`select finance_mark_receivable_received('77000000-0000-4000-8000-000000000001', true)`);
await asNone();
check('recebido duas vezes soma uma vez (idempotência preservada)', Number(await val(`select available_cents from finance_balance where workspace_id = '${WL}'`)) === 111000);
await as(L);
await expectError('saldo: tela aberta antes do recebimento não apaga o recebimento', `select finance_set_balance_checked('${WL}', 91000, null, '${v3.toISOString()}')`, '40001');
await asNone();
await as(L);
await expectError('saldo: reserva negativa continua recusada', `select finance_set_balance_checked('${WL}', null, -1, (select updated_at from finance_balance where workspace_id = '${WL}'))`, '22023');
await asNone();
await as(A);
await expectError('terceiro NÃO ajusta o saldo da casa', `select finance_set_balance_checked('${WL}', 1, null, now())`, /./);
await asNone();
check('função antiga continua disponível (app publicado hoje segue funcionando)', (await val(`select count(*) from pg_proc where proname = 'finance_set_balance'`)) === 1);
// Recebimento e compromisso: UPDATE condicional em uma única instrução (como o app faz).
await as(L);
const rv = await val(`select updated_at from finance_receivables where id = '77000000-0000-4000-8000-000000000001'`);
await db.exec(`update finance_receivables set description = 'Freela do Lucas' where id = '77000000-0000-4000-8000-000000000001' and updated_at = '${rv.toISOString()}'`);
await asNone();
await as(M);
const rows2 = await db.query(`update finance_receivables set description = 'Freela do Matheus' where id = '77000000-0000-4000-8000-000000000001' and updated_at = '${rv.toISOString()}' returning id`);
await asNone();
check('recebimento: edição com versão antiga atualiza 0 linhas (o app lança erro) e não sobrescreve', rows2.rows.length === 0 && (await val(`select description from finance_receivables where id = '77000000-0000-4000-8000-000000000001'`)) === 'Freela do Lucas');
const cv = await val(`select updated_at from finance_commitments where id = 'ffffffff-0000-4000-8000-000000000001'`);
await as(L);
await db.exec(`update finance_commitments set amount_cents = 10500 where id = 'ffffffff-0000-4000-8000-000000000001' and updated_at = '${cv.toISOString()}'`);
await asNone();
await as(M);
const rows3 = await db.query(`update finance_commitments set amount_cents = 99999 where id = 'ffffffff-0000-4000-8000-000000000001' and updated_at = '${cv.toISOString()}' returning id`);
await asNone();
check('compromisso: edição com versão antiga atualiza 0 linhas e o valor do primeiro permanece', rows3.rows.length === 0 && Number(await val(`select amount_cents from finance_commitments where id = 'ffffffff-0000-4000-8000-000000000001'`)) === 10500);

/* ------------------------------------------------ Realtime e grants */
const published = (await rows(`select tablename from pg_publication_tables where pubname = 'supabase_realtime'`)).map((r) => r.tablename);
for (const t of ['workout_athletes', 'workout_days', 'workout_exercises', 'workout_exercise_loads', 'workout_sessions', 'workout_set_logs', 'workout_body_weights', 'learning_practice_items', 'finance_item_categories', 'finance_category_rules', 'finance_expenses']) {
  check(`publicada no Realtime: ${t}`, published.includes(t));
}
check('workspace_invites NÃO é publicada no Realtime', !published.includes('workspace_invites'));
await db.exec(readFileSync(join(migDir, '20261015130000_realtime_finance_categories_expenses.sql'), 'utf8'));
check('migration de Realtime é idempotente (segunda execução sem erro)', true);

console.log(failed === 0 ? '\nTODAS as verificações passaram.' : `\n${failed} verificação(ões) FALHARAM.`);
process.exit(failed === 0 ? 0 : 1);

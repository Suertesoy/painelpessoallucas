// Validação das migrations financeiras em um Postgres embutido (PGlite): local, gratuito e descartável.
// Preparo (uma vez, FORA do projeto): npm install @electric-sql/pglite --prefix <pasta-fora-do-projeto>
// Uso: node supabase/tests/validate-finance-migrations.mjs <pasta-onde-o-pglite-foi-instalado> supabase/migrations
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [envDir, migDir] = process.argv.slice(2);
const pg = await import(pathToFileURL(join(envDir, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new pg.PGlite();

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, ok: Boolean(cond), detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + detail}`);
}
async function expectError(name, sqlText, code) {
  try {
    await db.exec(sqlText);
    check(name, false, 'não deu erro');
  } catch (e) {
    const got = e.code ?? '';
    check(name, code ? got === code : true, `esperado ${code}, veio ${got || e.message}`);
  }
}
const one = async (q) => (await db.query(q)).rows[0];
const val = async (q) => Object.values((await db.query(q)).rows[0] ?? {})[0];

const L = '11111111-1111-4111-8111-111111111111'; // Lucas
const M = '22222222-2222-4222-8222-222222222222'; // Matheus (como membro do workspace do Lucas, simulado)
const A = '33333333-3333-4333-8333-333333333333'; // terceiro (workspace próprio)

const as = async (uid, role = 'authenticated') => {
  await db.exec(`reset role; select set_config('request.jwt.claims', '${JSON.stringify({ sub: uid, role })}', false); set role ${role};`);
};
const asNone = async () => { await db.exec('reset role;'); };

/* ------------------------------------------------------------- stubs Supabase */
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

/* ------------------------------------------------------------------ migrations */
const files = [
  '20260716120000_core_schema.sql',
  '20260815100000_finance_cash_core.sql',
  '20260816100000_finance_categories_fixed_incomes.sql',
  '20260818100000_finance_category_learning.sql',
  '20260819100000_finance_expenses.sql',
];
for (const f of files) {
  let sql = readFileSync(join(migDir, f), 'utf8').replace(/create extension if not exists "pgcrypto";/g, '');
  try {
    await db.exec(sql);
    check(`migration aplica sem erro: ${f}`, true);
  } catch (e) {
    check(`migration aplica sem erro: ${f}`, false, e.message);
    console.log('ABORTADO: não dá para continuar sem a migration.');
    process.exit(2);
  }
}

/* ------------------------------------------------------------------ fixtures */
await db.exec(`
  insert into auth.users (id, email) values ('${L}', 'lucas@example.com'), ('${M}', 'matheus@example.com'), ('${A}', 'terceiro@example.com');
`);
const WL = await val(`select workspace_id from workspace_members where user_id = '${L}'`);
const WM = await val(`select workspace_id from workspace_members where user_id = '${M}'`);
const WA = await val(`select workspace_id from workspace_members where user_id = '${A}'`);
// Matheus passa a membro do workspace do Lucas (o que o convite fará); mantém o próprio.
await db.exec(`insert into workspace_members (workspace_id, user_id, role) values ('${WL}', '${M}', 'member')`);
check('fixtures: três workspaces distintos', new Set([WL, WM, WA]).size === 3);

const grantsOk = await val(`select bool_and(has_table_privilege('authenticated', t, 'select')) from unnest(array['public.finance_item_categories','public.finance_category_rules','public.finance_expenses','public.finance_category_seed']) t`);
check('authenticated tem privilégio nas tabelas novas (RLS decide as linhas)', grantsOk === true);
check('anon NÃO tem privilégio nas tabelas novas', (await val(`select bool_or(has_table_privilege('anon', t, 'select')) from unnest(array['public.finance_item_categories','public.finance_category_rules','public.finance_expenses','public.finance_category_seed']) t`)) === false);
check('RLS ligada nas tabelas novas', (await val(`select bool_and(relrowsecurity) from pg_class where relname in ('finance_item_categories','finance_category_rules','finance_expenses','finance_category_seed')`)) === true);

const DEFAULTS = [['groceries','Mercado'],['restaurants','Restaurantes e delivery'],['shopping','Compras online'],['streaming','Streaming'],['subscriptions','Assinaturas e aplicativos'],['leisure','Lazer'],['housing','Moradia e contas'],['transport','Transporte'],['health','Saúde'],['travel','Viagens'],['other','Outros']];
const seedSql = (ws) =>
  `insert into finance_item_categories (workspace_id, id, label, sort_order) values ${DEFAULTS.map(([id, label], i) => `('${ws}', '${id}', '${label}', ${i})`).join(',')} on conflict (workspace_id, id) do nothing;
   insert into finance_category_seed (workspace_id) values ('${ws}') on conflict (workspace_id) do nothing;`;

/* ---------------------------------------------- B. RLS e isolamento por workspace */
await as(L);
await db.exec(seedSql(WL));
await db.exec(seedSql(WL)); // idempotente: segunda semeadura não duplica
await db.exec(seedSql(WL));
check('semeadura é idempotente (11 categorias, 1 marcador)', (await val(`select count(*) from finance_item_categories`)) === 11 && (await val(`select count(*) from finance_category_seed`)) === 1);

await as(A);
check('terceiro NÃO enxerga categorias do workspace do Lucas', (await val(`select count(*) from finance_item_categories`)) === 0);
await expectError('terceiro NÃO insere categoria no workspace do Lucas', `insert into finance_item_categories (workspace_id, id, label) values ('${WL}', 'invasao', 'Invasão')`, '42501');
await db.exec(`update finance_item_categories set label = 'hack' where workspace_id = '${WL}'`);
await asNone();
check('terceiro NÃO consegue renomear categoria alheia (0 linhas)', (await val(`select count(*) from finance_item_categories where label = 'hack'`)) === 0);
await as(A);
await db.exec(`delete from finance_item_categories where workspace_id = '${WL}'`);
await asNone();
check('terceiro NÃO consegue excluir categoria alheia', (await val(`select count(*) from finance_item_categories where workspace_id = '${WL}'`)) === 11);

await as('00000000-0000-4000-8000-000000000000', 'anon').catch(() => {});
await expectError('anon NÃO lê categorias', `select * from finance_item_categories`, '42501');
await asNone();

await as(M);
check('Matheus (membro) enxerga as categorias do workspace doméstico', (await val(`select count(*) from finance_item_categories where workspace_id = '${WL}'`)) === 11);
await db.exec(`insert into finance_item_categories (workspace_id, id, label, sort_order) values ('${WL}', 'armazenamento', 'Armazenamento', 11)`);
await db.exec(`update finance_item_categories set label = 'Nuvem' where workspace_id = '${WL}' and id = 'armazenamento'`);
await asNone();
check('Matheus cria e renomeia categoria (mesmas capacidades do Lucas)', (await val(`select label from finance_item_categories where workspace_id = '${WL}' and id = 'armazenamento'`)) === 'Nuvem');

await expectError('nome repetido (sem diferenciar maiúsculas/espaços) é recusado', `insert into finance_item_categories (workspace_id, id, label) values ('${WL}', 'outra', '  MERCADO ')`, '23505');
await db.exec(`insert into finance_item_categories (workspace_id, id, label) values ('${WA}', 'mercado_x', 'Mercado')`);
check('o mesmo nome pode existir em outro workspace', true);
await expectError('id inválido (maiúsculas) é recusado', `insert into finance_item_categories (workspace_id, id, label) values ('${WL}', 'AB', 'Qualquer')`, '23514');
await expectError('nome curto demais é recusado', `insert into finance_item_categories (workspace_id, id, label) values ('${WL}', 'cc', 'x')`, '23514');
await db.exec(`delete from finance_item_categories where id = 'armazenamento' and workspace_id = '${WL}'`);

/* ---------------------------------- fatura + itens (dados de teste, como superusuário) */
await db.exec(`
  insert into finance_card_invoices (id, workspace_id, card, month, status, imported_amount_cents, rev) values
    ('aaaaaaaa-0000-4000-8000-000000000001', '${WL}', 'nubank_1', '2026-10', 'open', 30000, 1);
  insert into finance_invoice_imports (id, workspace_id, invoice_id, request_id, file_name, file_sha256) values
    ('bbbbbbbb-0000-4000-8000-000000000001', '${WL}', 'aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'f.csv', 'abc');
  insert into finance_invoice_items (id, workspace_id, invoice_id, first_import_id, last_import_id, purchase_date, description, normalized_description, amount_cents, kind, base_description, category) values
    ('dddddddd-0000-4000-8000-000000000001', '${WL}', 'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', '2026-10-05', 'APPLE.COM/BILL', 'apple com bill', 6690, 'purchase', 'apple com bill', 'subscriptions'),
    ('dddddddd-0000-4000-8000-000000000002', '${WL}', 'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', '2026-10-06', 'NETFLIX', 'netflix', 5590, 'purchase', 'netflix', 'subscriptions'),
    ('dddddddd-0000-4000-8000-000000000003', '${WL}', 'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', '2026-10-07', 'PADARIA', 'padaria', 1200, 'purchase', 'padaria', 'groceries'),
    ('dddddddd-0000-4000-8000-000000000004', '${WL}', 'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', '2026-10-08', 'SEM CATEGORIA', 'sem categoria', 999, 'purchase', 'sem categoria', null);
`);
const FIN = `select md5(string_agg(id::text||purchase_date::text||amount_cents::text||kind||status||invoice_id::text||coalesce(commitment_id::text,''), '|' order by id)) from finance_invoice_items`;
const finBefore = await val(FIN);

/* ----------------------------- C. regras aprendidas e integridade após exclusões */
await db.exec(`insert into finance_category_rules (id, workspace_id, merchant_key, amount_cents, category) values
  ('eeeeeeee-0000-4000-8000-000000000001', '${WL}', 'apple com bill', 6690, 'subscriptions'),
  ('eeeeeeee-0000-4000-8000-000000000002', '${WL}', 'netflix', null, 'subscriptions'),
  ('eeeeeeee-0000-4000-8000-000000000003', '${WL}', 'padaria', null, 'groceries')`);
await expectError('regra para categoria inexistente é recusada (FK)', `insert into finance_category_rules (workspace_id, merchant_key, amount_cents, category) values ('${WL}', 'x', 1, 'nao_existe')`, '23503');
await expectError('regra duplicada (mesmo estabelecimento + valor) é recusada', `insert into finance_category_rules (workspace_id, merchant_key, amount_cents, category) values ('${WL}', 'apple com bill', 6690, 'other')`, '23505');
await expectError('regra "qualquer valor" duplicada (valor nulo) é recusada', `insert into finance_category_rules (workspace_id, merchant_key, amount_cents, category) values ('${WL}', 'netflix', null, 'other')`, '23505');
await db.exec(`insert into finance_category_rules (workspace_id, merchant_key, amount_cents, category) values ('${WL}', 'apple com bill', null, 'other')`);
check('mesma chave com valor específico e com "qualquer valor" convivem', (await val(`select count(*) from finance_category_rules where merchant_key = 'apple com bill'`)) === 2);
await expectError('proveniência inválida é recusada', `update finance_invoice_items set category_source = 'x' where id = 'dddddddd-0000-4000-8000-000000000001'`, '23514');

// terceiro não vê nem mexe em regras alheias
await as(A);
check('terceiro NÃO enxerga regras do workspace do Lucas', (await val(`select count(*) from finance_category_rules`)) === 0);
await expectError('terceiro NÃO cria regra no workspace do Lucas', `insert into finance_category_rules (workspace_id, merchant_key, category) values ('${WL}', 'x', 'other')`, '42501');
await asNone();

// aplicação idempotente (mesma instrução do app): só preenche category IS NULL
const apply = `update finance_invoice_items set category = 'other', category_source = 'rule', category_rule_id = 'eeeeeeee-0000-4000-8000-000000000003' where workspace_id = '${WL}' and category is null and id = 'dddddddd-0000-4000-8000-000000000004'`;
await as(L);
const r1 = await db.query(apply); const r2 = await db.query(apply);
await asNone();
check('aplicação de regra é idempotente (1ª muda 1 linha, 2ª muda 0)', r1.affectedRows === 1 && r2.affectedRows === 0);
check('classificação confirmada não é sobrescrita pela guarda "category IS NULL"', (await val(`select category from finance_invoice_items where id = 'dddddddd-0000-4000-8000-000000000003'`)) === 'groceries');

// renomear não quebra nada (o id é o vínculo)
await as(L);
await db.exec(`update finance_item_categories set label = 'Apps e assinaturas' where workspace_id = '${WL}' and id = 'subscriptions'`);
await asNone();
check('renomear categoria nativa: lançamentos e regras seguem no mesmo id', (await val(`select count(*) from finance_invoice_items where category = 'subscriptions'`)) === 2 && (await val(`select count(*) from finance_category_rules where category = 'subscriptions'`)) === 2);

// excluir SEM substituta (mesma sequência do app: itens, regras, categoria)
await as(L);
await db.exec(`
  update finance_invoice_items set category = null, category_source = null, category_rule_id = null where workspace_id = '${WL}' and category = 'subscriptions';
  delete from finance_category_rules where workspace_id = '${WL}' and category = 'subscriptions';
  delete from finance_item_categories where workspace_id = '${WL}' and id = 'subscriptions';
`);
await asNone();
check('excluir sem substituta: lançamentos ficam sem categoria e sem proveniência', (await val(`select count(*) from finance_invoice_items where id in ('dddddddd-0000-4000-8000-000000000001','dddddddd-0000-4000-8000-000000000002') and category is null and category_source is null and category_rule_id is null`)) === 2);
check('excluir sem substituta: nenhuma regra aponta para categoria inexistente', (await val(`select count(*) from finance_category_rules r where not exists (select 1 from finance_item_categories c where c.workspace_id = r.workspace_id and c.id = r.category)`)) === 0);
check('valores, datas e vínculos dos lançamentos intactos', (await val(FIN)) === finBefore);

// excluir COM substituta
await as(L);
await db.exec(`
  update finance_invoice_items set category = 'streaming', category_source = 'user', category_rule_id = null where workspace_id = '${WL}' and category = 'groceries';
  update finance_category_rules set category = 'streaming' where workspace_id = '${WL}' and category = 'groceries';
  delete from finance_item_categories where workspace_id = '${WL}' and id = 'groceries';
`);
await asNone();
check('excluir com substituta: itens e regras seguem para ela, sem referência inválida', (await val(`select count(*) from finance_invoice_items where category = 'streaming'`)) === 1 && (await val(`select count(*) from finance_category_rules r where not exists (select 1 from finance_item_categories c where c.workspace_id = r.workspace_id and c.id = r.category)`)) === 0);

// a própria FK protege mesmo se o app esquecesse de limpar regras
await as(L);
await db.exec(`insert into finance_category_rules (workspace_id, merchant_key, amount_cents, category) values ('${WL}', 'cinema', null, 'leisure')`);
await db.exec(`delete from finance_item_categories where workspace_id = '${WL}' and id = 'leisure'`);
await asNone();
check('FK composta com cascade remove regras de categoria excluída (rede de segurança no banco)', (await val(`select count(*) from finance_category_rules where merchant_key = 'cinema'`)) === 0);

// excluir TODAS não recria (marcador permanece)
await as(L);
await db.exec(`delete from finance_item_categories where workspace_id = '${WL}'`);
await asNone();
check('excluir tudo: lista vazia e marcador de semeadura permanece (app não recria)', (await val(`select count(*) from finance_item_categories where workspace_id = '${WL}'`)) === 0 && (await val(`select count(*) from finance_category_seed where workspace_id = '${WL}'`)) === 1);
await as(L);
await db.exec(seedSql(WL).split(';')[0]); // se o app semeasse de novo, o on conflict não duplicaria
await db.exec(`delete from finance_item_categories where workspace_id = '${WL}'`);
await asNone();

/* ------------------------------------------------------ D. despesas e saldo */
await db.exec(`insert into finance_balance (workspace_id, available_cents, reserve_cents) values ('${WL}', 405000, 900000), ('${WA}', 100000, 0)`);
const bal = async (ws = WL) => Number(await val(`select available_cents from finance_balance where workspace_id = '${ws}'`));
const reserve = async () => Number(await val(`select reserve_cents from finance_balance where workspace_id = '${WL}'`));
const commitmentsBefore = await val(`select count(*) from finance_commitments`);

await as(L);
await db.exec(`select finance_record_expense('${WL}', '  Corte de cabelo ', 5000, '2026-10-14', 'pix', '', true)`);
await asNone();
check('registrar gasto com desconto: saldo 4050,00 -> 4000,00 e reserva intacta', (await bal()) === 400000 && (await reserve()) === 900000);
const e1 = await one(`select * from finance_expenses where workspace_id = '${WL}'`);
check('gasto gravado com texto aparado, categoria vazia vira nula e marcado como descontado', e1.description === 'Corte de cabelo' && e1.category === null && e1.deducted_from_balance === true && e1.kind === 'expense' && e1.source === 'manual');

await as(L);
await db.exec(`select finance_record_expense('${WL}', 'Feira', 3250, '2026-10-10', 'cash', 'other', false)`);
await asNone();
check('registrar sem desconto não mexe no saldo', (await bal()) === 400000);

for (const [name, args, code] of [
  ['valor zero é recusado', `'${WL}', 'X', 0, '2026-10-10', 'pix', '', true`, '23514'],
  ['valor negativo é recusado', `'${WL}', 'X', -5, '2026-10-10', 'pix', '', true`, '23514'],
  ['forma de pagamento inválida é recusada', `'${WL}', 'X', 100, '2026-10-10', 'cheque', '', true`, '23514'],
  ['descrição vazia é recusada', `'${WL}', '   ', 100, '2026-10-10', 'pix', '', true`, '23514'],
  ['categoria com formato inválido é recusada', `'${WL}', 'X', 100, '2026-10-10', 'pix', 'AB', true`, '23514'],
]) {
  await as(L);
  await expectError(name, `select finance_record_expense(${args})`, code);
  await asNone();
}
check('falhas de validação não descontam do saldo (atomicidade)', (await bal()) === 400000);

await as(A);
await expectError('terceiro NÃO registra gasto no workspace do Lucas', `select finance_record_expense('${WL}', 'Invasão', 100, '2026-10-10', 'pix', '', true)`, '42501');
await asNone();
check('tentativa do terceiro não alterou o saldo do Lucas', (await bal()) === 400000);

await as(M);
await db.exec(`select finance_record_expense('${WL}', 'Mercado', 10000, '2026-10-12', 'debit', '', true)`);
await asNone();
check('Matheus (membro) registra gasto com as mesmas regras (saldo 3900,00)', (await bal()) === 390000);

await as(A);
check('terceiro NÃO enxerga gastos do workspace do Lucas', (await val(`select count(*) from finance_expenses`)) === 0);
await expectError('terceiro NÃO exclui gasto alheio nem devolve saldo', `select finance_delete_expense('${e1.id}', true)`);
await asNone();
check('exclusão indevida não alterou saldo nem gasto', (await bal()) === 390000 && (await val(`select count(*) from finance_expenses where id = '${e1.id}'`)) === 1);

// exclusão com devolução: só o que foi descontado, uma única vez
await as(L);
await db.exec(`select finance_delete_expense('${e1.id}', true)`);
await asNone();
check('excluir gasto descontado devolve exatamente o valor (3900,00 -> 3950,00)', (await bal()) === 395000);
await as(L);
await expectError('excluir de novo o mesmo gasto não devolve nada outra vez', `select finance_delete_expense('${e1.id}', true)`, 'P0002');
await asNone();
check('sem devolução em dobro', (await bal()) === 395000);
const feira = await val(`select id from finance_expenses where description = 'Feira'`);
await as(L);
await db.exec(`select finance_delete_expense('${feira}', true)`);
await asNone();
check('excluir gasto que NÃO foi descontado não credita o saldo (mesmo pedindo devolução)', (await bal()) === 395000);
const merc = await val(`select id from finance_expenses where description = 'Mercado'`);
await as(L);
await db.exec(`select finance_delete_expense('${merc}', false)`);
await asNone();
check('excluir sem pedir devolução não mexe no saldo', (await bal()) === 395000);
check('registrar/excluir gasto nunca cria compromisso nem altera outro workspace', (await val(`select count(*) from finance_commitments`)) === commitmentsBefore && (await bal(WA)) === 100000);

// idempotência por solicitação: duplo toque / nova tentativa
{
  const before = await bal();
  const REQ = '99999999-0000-4000-8000-000000000001';
  const call = `select finance_record_expense('${WL}', 'Pix teste', 1000, '2026-10-15', 'pix', '', true, '${REQ}')`;
  await as(L);
  await db.exec(call);
  await db.exec(call); // repetição da MESMA solicitação
  await db.exec(call);
  await asNone();
  check('mesma solicitação repetida 3x: um único gasto e um único desconto', (await val(`select count(*) from finance_expenses where request_id = '${REQ}'`)) === 1 && (await bal()) === before - 1000);
  await as(L);
  await db.exec(`select finance_record_expense('${WL}', 'Pix teste', 1000, '2026-10-15', 'pix', '', true, '99999999-0000-4000-8000-000000000002')`);
  await asNone();
  check('solicitação diferente é um gasto novo (dois toques intencionais contam duas vezes)', (await val(`select count(*) from finance_expenses where description = 'Pix teste'`)) === 2 && (await bal()) === before - 2000);
  await as(A);
  await expectError('chave de outra pessoa não é reaproveitada para invadir o workspace', `select finance_record_expense('${WL}', 'Pix teste', 1000, '2026-10-15', 'pix', '', true, '${REQ}')`, '42501');
  await asNone();
  await db.exec(`delete from finance_expenses where description = 'Pix teste'; update finance_balance set available_cents = ${before} where workspace_id = '${WL}'`);
  check('limpeza do cenário de idempotência', (await bal()) === before);
}

/* ------------------------------------ E. faturas históricas pagas e saldo */
await db.exec(`insert into finance_card_invoices (id, workspace_id, card, month, status, imported_amount_cents, rev) values
  ('aaaaaaaa-0000-4000-8000-000000000011', '${WL}', 'nubank_1', '2026-08', 'closed', 300000, 1),
  ('aaaaaaaa-0000-4000-8000-000000000012', '${WL}', 'nubank_1', '2026-09', 'closed', 280000, 1)`);
await as(L);
await db.exec(`select finance_mark_invoice_paid('aaaaaaaa-0000-4000-8000-000000000011', false)`);
await asNone();
const hist = await one(`select status, paid_at from finance_card_invoices where id = 'aaaaaaaa-0000-4000-8000-000000000011'`);
check('fatura histórica marcada como paga SEM descontar: saldo igual', hist.status === 'paid' && hist.paid_at && (await bal()) === 395000);
await as(L);
await db.exec(`select finance_mark_invoice_paid('aaaaaaaa-0000-4000-8000-000000000011', true)`); // repetir é inofensivo
await asNone();
check('marcar como paga de novo (mesmo pedindo desconto) não desconta: idempotente', (await bal()) === 395000);
await as(L);
await db.exec(`select finance_mark_invoice_paid('aaaaaaaa-0000-4000-8000-000000000012', true)`);
await asNone();
check('pagamento normal desconta uma única vez (3950,00 - 2800,00 = 1150,00)', (await bal()) === 115000);
await as(A);
await expectError('terceiro NÃO marca fatura alheia como paga', `select finance_mark_invoice_paid('aaaaaaaa-0000-4000-8000-000000000001', true)`);
await asNone();
check('fatura do Lucas continua aberta e saldo intacto após tentativa do terceiro', (await val(`select status from finance_card_invoices where id = 'aaaaaaaa-0000-4000-8000-000000000001'`)) === 'open' && (await bal()) === 115000);

/* ------------------------------------------------------------------- resumo */
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram.`);
if (failed.length) { console.log('FALHAS:'); for (const f of failed) console.log(' -', f.name, '|', f.detail); process.exit(1); }

-- SOMENTE LEITURA. Antes e depois de aplicar as 6 migrations (cada arquivo, em ordem, UM por vez).

-- ===== ANTES (preflight) =====
-- A) Dependências usadas pelas migrations: devem retornar 4 linhas.
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname in ('set_updated_at','is_workspace_member','finance_assert_member','ensure_personal_workspace');

-- B) Tabelas das migrations que precisam EXISTIR (devem retornar 12 linhas) e as que NÃO podem existir (0 linhas)
select table_name from information_schema.tables where table_schema = 'public' and table_name in
 ('profiles','workspaces','workspace_members','learning_courses','study_sessions','finance_balance','finance_receivables',
  'finance_commitments','finance_item_categories','finance_category_rules','finance_expenses','finance_invoice_items');
select table_name from information_schema.tables where table_schema = 'public' and table_name in
 ('workspace_invites','learning_practice_items') or table_name like 'workout\_%';

-- C) ensure_personal_workspace atual (a migration 1 a substitui; confira que é a versão "mais antigo membership")
select pg_get_functiondef('public.ensure_personal_workspace()'::regprocedure);

-- D) Linha de base dos dados (anote os números; devem ser os mesmos depois, salvo uso legítimo)
select (select count(*) from workspaces) as workspaces, (select count(*) from workspace_members) as membros,
       (select count(*) from learning_courses) as cursos, (select count(*) from study_sessions) as sessoes,
       (select count(*) from finance_item_categories) as categorias, (select count(*) from finance_expenses) as gastos,
       (select count(*) from items) as itens;

-- ===== DEPOIS (verificação) =====
-- E) Estruturas novas (esperado: 4 + 3 + 1 + 1)
select 'tabelas' k, count(*) from information_schema.tables where table_schema='public'
  and (table_name in ('workspace_invites','learning_practice_items') or table_name like 'workout\_%');            -- 9
select 'cols_sessao' k, count(*) from information_schema.columns where table_schema='public' and table_name='study_sessions'
  and column_name in ('paused_at','paused_total_seconds','active_seconds');                                       -- 3
select 'owner_curso' k, count(*) from information_schema.columns where table_schema='public' and table_name='learning_courses' and column_name='owner_user_id'; -- 1
select 'perfil_padrao' k, count(*) from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='default_workspace_id'; -- 1

-- F) Funções e privilégios (authenticated sim; anon/public não)
select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('anon', p.oid, 'execute') as anon
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and proname in ('create_workspace_invite','accept_workspace_invite','list_workspace_members',
  'list_workspace_invites','revoke_workspace_invite','finance_set_balance','finance_set_balance_checked');

-- G) RLS ligada nas tabelas novas (todas true) e índice por curso
select relname, relrowsecurity from pg_class where relname in ('workspace_invites','learning_practice_items',
  'workout_athletes','workout_days','workout_exercises','workout_exercise_loads','workout_sessions','workout_set_logs','workout_body_weights');
select indexdef from pg_indexes where indexname = 'study_sessions_one_active_idx';  -- (course_id) where status = 'in_progress'

-- H) Realtime (esperado 11 tabelas novas na lista)
select tablename from pg_publication_tables where pubname='supabase_realtime'
 and (tablename like 'workout\_%' or tablename in ('learning_practice_items','finance_item_categories','finance_category_rules','finance_expenses'));

-- I) Mesmos números do item D; curso de Japonês continua sem dono e com as sessões
select (select count(*) from workspaces) as workspaces, (select count(*) from learning_courses) as cursos,
       (select count(*) from learning_courses where owner_user_id is null) as cursos_sem_dono,
       (select count(*) from study_sessions) as sessoes, (select count(*) from finance_item_categories) as categorias,
       (select count(*) from finance_expenses) as gastos;

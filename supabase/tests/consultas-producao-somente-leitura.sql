-- Consultas SOMENTE LEITURA para o SQL Editor do Supabase (produção).
-- Nenhuma altera dados. Rode uma por vez e devolva o resultado (texto/print).
-- Não use `supabase db push`; o histórico de migrations não será alterado.

-- 1) Histórico registrado (migrations aplicadas à mão podem não aparecer aqui)
select version, name from supabase_migrations.schema_migrations order by version;

-- 2) O que EXISTE de fato (colunas = quantas tabelas/colunas das migrations já estão no banco)
select table_name, count(*) as colunas
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'finance_balance','finance_receivables','finance_commitments','finance_invoice_items',
    'finance_recurring_incomes','finance_item_categories','finance_category_rules','finance_category_seed',
    'finance_expenses','learning_courses','study_sessions','learning_lesson_progress','profiles',
    -- devem NÃO existir ainda (retornam 0 linhas):
    'workspace_invites','learning_practice_items','workout_athletes','workout_sessions')
group by table_name order by table_name;

-- 3) Colunas que as migrations novas vão adicionar (devem retornar 0 linhas hoje)
select table_name, column_name from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'profiles' and column_name = 'default_workspace_id')
    or (table_name = 'study_sessions' and column_name in ('paused_at','paused_total_seconds','active_seconds'))
    or (table_name = 'learning_courses' and column_name = 'owner_user_id'));

-- 4) Funções que as migrations usam ou substituem
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('ensure_personal_workspace','is_workspace_member','finance_assert_member',
                    'finance_set_balance','finance_set_balance_checked','set_updated_at',
                    'create_workspace_invite','accept_workspace_invite');

-- 5) Índice que será trocado (de "um por workspace" para "um por curso")
select indexname, indexdef from pg_indexes
where schemaname = 'public' and indexname = 'study_sessions_one_active_idx';

-- 6) Tabelas já publicadas no Realtime
select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename;

-- 7) Quem pertence a cada workspace (confirma contas reais e a separação do Alicson)
select w.id as workspace_id, w.name, m.role, p.email
from workspaces w
join workspace_members m on m.workspace_id = w.id
left join profiles p on p.id = m.user_id
order by w.created_at, m.created_at;

-- 8) Onde está hoje o curso de Japonês (deve estar só no workspace do Lucas)
select c.workspace_id, c.slug, c.created_at,
       (select count(*) from study_sessions s where s.course_id = c.id) as sessoes,
       (select count(*) from learning_lesson_progress lp where lp.course_id = c.id) as progresso_licoes
from learning_courses c order by c.created_at;

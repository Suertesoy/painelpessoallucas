-- =============================================================================
-- Migration: Realtime para categorias, regras aprendidas e gastos pontuais
-- =============================================================================
-- Com Lucas e Matheus no mesmo workspace, uma categoria criada/renomeada/
-- excluída ou um gasto registrado por um deles precisa aparecer no aparelho do
-- outro na hora. As migrations 20260818 e 20260819 criaram essas tabelas sem
-- publicá-las no Realtime (só a reconciliação por foco/visibilidade as
-- atualizaria). Idempotente e aditiva; RLS continua sendo a barreira.
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array['finance_item_categories', 'finance_category_rules', 'finance_expenses'] loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t)
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
       ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

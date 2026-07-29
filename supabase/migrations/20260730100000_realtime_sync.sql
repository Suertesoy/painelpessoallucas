-- =============================================================================
-- Sincronização instantânea entre dispositivos (Supabase Realtime)
-- =============================================================================
-- O cliente assina Postgres Changes e, ao receber qualquer evento, refaz as
-- Queries ativas. RLS continua sendo a barreira de acesso: cada sessão recebe
-- somente as linhas visíveis para seu workspace.
--
-- A aplicação usa soft delete nas entidades principais; exclusões relevantes
-- chegam como UPDATE de deleted_at, portanto não dependemos do payload antigo
-- de DELETE nem de REPLICA IDENTITY FULL.
-- =============================================================================

do $$
declare
  table_name text;
  realtime_tables text[] := array[
    'projects',
    'items',
    'daily_plans',
    'daily_plan_items',
    'item_relations',
    'source_documents',
    'execution_plans',
    'plan_phases',
    'plan_actions',
    'recurrence_rules',
    'reminders',
    'notifications',
    'ai_runs',
    'integration_accounts',
    'calendar_event_links',
    'workspace_settings',
    'automation_runs',
    'learning_courses',
    'learning_course_preferences',
    'learning_modules',
    'learning_lessons',
    'study_sessions',
    'learning_lesson_progress'
  ];
begin
  foreach table_name in array realtime_tables loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        table_name
      );
    end if;
  end loop;
end
$$;

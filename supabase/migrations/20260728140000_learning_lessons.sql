-- =============================================================================
-- Migration: Lições reais dos módulos (correção do módulo Aprendizado)
-- =============================================================================
-- Causa raiz corrigida: `learning_modules.lessons_count` anunciava lições
-- (ex.: "Fundamentos" com 1 lição) sem nenhuma entidade correspondente no
-- banco — um contador artificial. Esta migration cria a tabela real de
-- lições; `LearningCommands.ensureModulesAndLessons` (aplicação) passa a
-- criar as lições reais e a corrigir `lessons_count` para refletir a
-- contagem real, inclusive em workspaces já inicializados antes desta
-- correção (reparo idempotente, sem duplicar).
-- =============================================================================

create table public.learning_lessons (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  module_id uuid not null references public.learning_modules (id) on delete cascade,
  title text not null,
  description text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module_id, position)
);

create index learning_lessons_module_idx on public.learning_lessons (module_id);

create trigger learning_lessons_updated_at
  before update on public.learning_lessons
  for each row execute function public.set_updated_at();

alter table public.learning_lessons enable row level security;

create policy "learning_lessons_select" on public.learning_lessons
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "learning_lessons_insert" on public.learning_lessons
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "learning_lessons_update" on public.learning_lessons
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "learning_lessons_delete" on public.learning_lessons
  for delete to authenticated using (public.is_workspace_member(workspace_id));

-- GRANTS — este projeto Supabase não expõe tabelas novas automaticamente
-- (ver 20260722140000_api_role_grants.sql).
grant select, insert, update, delete on public.learning_lessons to authenticated;

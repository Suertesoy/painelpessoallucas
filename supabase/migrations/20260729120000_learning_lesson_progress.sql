-- =============================================================================
-- Migration: Progresso persistido de lição (Learning Content Engine —
-- fechamento da Fase 2 do módulo Aprendizado)
-- =============================================================================
-- Uma linha por (workspace, lição) — nunca em `study_sessions`, que é sobre
-- tempo estudado e nunca deriva progresso estrutural (ver ARCHITECTURE.md).
-- A ausência de linha é o estado "not_started"; a linha só passa a existir
-- na primeira visualização da lição (`LearningCommands.recordLessonViewed`,
-- que só leva a in_progress — NUNCA conclui automaticamente).
--
-- `attempts` (jsonb, `{ [blockId]: { firstOutcome, latestOutcome,
-- attemptCount, resolvedAt? } }`) é a fonte de verdade por blockId:
-- aprendizagem, não avaliação — uma resposta incorreta não trava o
-- exercício, só a "avaliação" (firstOutcome é imutável). `answered_count`/
-- `resolved_count` são contadores derivados, sempre recalculados pela
-- aplicação a partir de `attempts` — mesmo princípio de
-- `learning_modules.lessons_count`.
--
-- `status`/`completed_at` só mudam por ação explícita do usuário
-- ("Concluir lição", `LearningCommands.completeLesson`) — nunca inferidos
-- de visualização nem de exercícios resolvidos.
-- =============================================================================

create table public.learning_lesson_progress (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  course_id uuid not null references public.learning_courses (id) on delete cascade,
  module_id uuid not null references public.learning_modules (id) on delete cascade,
  lesson_id uuid not null references public.learning_lessons (id) on delete cascade,
  total_exercises integer not null default 0,
  answered_count integer not null default 0,
  resolved_count integer not null default 0,
  attempts jsonb not null default '{}'::jsonb,
  status text not null check (status in ('not_started', 'in_progress', 'completed')),
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, lesson_id)
);

create index learning_lesson_progress_module_idx on public.learning_lesson_progress (module_id);

create trigger learning_lesson_progress_updated_at
  before update on public.learning_lesson_progress
  for each row execute function public.set_updated_at();

alter table public.learning_lesson_progress enable row level security;

create policy "learning_lesson_progress_select" on public.learning_lesson_progress
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "learning_lesson_progress_insert" on public.learning_lesson_progress
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "learning_lesson_progress_update" on public.learning_lesson_progress
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "learning_lesson_progress_delete" on public.learning_lesson_progress
  for delete to authenticated using (public.is_workspace_member(workspace_id));

-- GRANTS — este projeto Supabase não expõe tabelas novas automaticamente
-- (ver 20260722140000_api_role_grants.sql).
grant select, insert, update, delete on public.learning_lesson_progress to authenticated;

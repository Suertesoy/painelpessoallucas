-- =============================================================================
-- Migration: Estudos — pausas reais na sessão de estudo + prática espaçada
-- =============================================================================
-- 100% aditiva: nenhuma coluna/tabela existente perde dados. Sessões antigas
-- continuam válidas (paused_total_seconds = 0 e active_seconds nulo, caso em
-- que o progresso do dia usa duration_minutes * 60).
--
-- 1) study_sessions
--    paused_at             instante em que a sessão em andamento foi pausada
--                          (nulo = rodando). O relógio congela nesse instante.
--    paused_total_seconds  soma das pausas já encerradas.
--    active_seconds        tempo realmente estudado (sem pausas), gravado ao
--                          encerrar. Fonte do progresso diário com precisão
--                          de segundos; duration_minutes segue como duração
--                          nominal (a coluna exige > 0).
--    O índice único study_sessions_one_active_idx continua valendo: uma
--    sessão pausada ainda é status = 'in_progress'.
--
-- 2) learning_practice_items
--    Estado de revisão espaçada (1, 3, 7 e 14 dias) por habilidade e conteúdo
--    (ex.: ler あ, reconhecer あ pelo som, escrever あ, completar uma palavra).
--    `script` prepara Katakana e Kanji sem mudar o modelo.
-- =============================================================================

alter table public.study_sessions
  add column paused_at timestamptz,
  add column paused_total_seconds integer not null default 0
    check (paused_total_seconds >= 0),
  add column active_seconds integer
    check (active_seconds is null or active_seconds >= 0);

create table public.learning_practice_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  course_id uuid not null references public.learning_courses (id) on delete cascade,
  kind text not null
    check (kind in ('kana_read', 'kana_hear', 'kana_write', 'word_fill')),
  script text not null default 'hiragana'
    check (script in ('hiragana', 'katakana', 'kanji')),
  subject text not null check (length(subject) > 0),
  box integer not null default 0 check (box between 0 and 4),
  due_on date not null,
  last_reviewed_on date,
  attempts integer not null default 0 check (attempts >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  last_result text check (last_result in ('correct', 'incorrect')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, course_id, kind, subject)
);

create index learning_practice_items_due_idx
  on public.learning_practice_items (workspace_id, course_id, due_on);

create trigger learning_practice_items_updated_at
  before update on public.learning_practice_items
  for each row execute function public.set_updated_at();

alter table public.learning_practice_items enable row level security;

create policy "learning_practice_items_select" on public.learning_practice_items
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "learning_practice_items_insert" on public.learning_practice_items
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "learning_practice_items_update" on public.learning_practice_items
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- O projeto Supabase não expõe tabelas novas automaticamente (ver
-- 20260722140000_api_role_grants.sql). Sem delete: itens são atualizados.
grant select, insert, update on public.learning_practice_items to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'learning_practice_items'
  ) then
    execute 'alter publication supabase_realtime add table public.learning_practice_items';
  end if;
end
$$;

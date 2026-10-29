-- =============================================================================
-- Migration: conclusão EXPLÍCITA de treino (ficha A–E)
-- =============================================================================
-- Regra de produto: uma ficha A–E só conta como concluída quando a pessoa toca
-- em "Concluir Treino". Cada toque grava UMA linha aqui; a unicidade
-- (session_id, day_id) torna o duplo toque idempotente.
--
-- Concluir uma ficha NÃO encerra a sessão geral de academia (workout_sessions
-- continua em andamento até "Encerrar academia").
--
-- Aditiva: nenhuma tabela ou coluna existente é alterada. Histórico antigo
-- (sessões/séries) permanece intacto; as conclusões anteriores a esta regra
-- NÃO são inventadas aqui — o app as exibe separadas, como "legado (estimado)".
-- Sem DELETE/UPDATE: uma conclusão registrada não é reescrita pelo navegador.
-- =============================================================================
create table public.workout_day_completions (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  athlete_id uuid not null references public.workout_athletes (id) on delete cascade,
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  day_id uuid not null references public.workout_days (id) on delete cascade,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (session_id, day_id)
);
create index workout_day_completions_athlete_idx
  on public.workout_day_completions (athlete_id, completed_at desc);

alter table public.workout_day_completions enable row level security;
create policy "workout_day_completions_select" on public.workout_day_completions
  for select to authenticated using (public.is_workspace_member(workspace_id));
-- Só insere conclusão de uma sessão EM ANDAMENTO do mesmo workspace e do mesmo
-- atleta, para uma ficha do mesmo workspace. (As colunas da linha são
-- qualificadas com o nome da tabela: dentro do EXISTS, "workspace_id" sem
-- qualificação apontaria para a tabela consultada, não para a linha nova.)
create policy "workout_day_completions_insert" on public.workout_day_completions
  for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.workout_sessions s
      where s.id = workout_day_completions.session_id
        and s.workspace_id = workout_day_completions.workspace_id
        and s.athlete_id = workout_day_completions.athlete_id
        and s.status = 'in_progress'
    )
    and exists (
      select 1 from public.workout_days d
      where d.id = workout_day_completions.day_id
        and d.workspace_id = workout_day_completions.workspace_id
    )
  );

grant select, insert on public.workout_day_completions to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workout_day_completions'
  ) then
    alter publication supabase_realtime add table public.workout_day_completions;
  end if;
end
$$;

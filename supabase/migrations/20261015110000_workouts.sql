-- =============================================================================
-- Migration: Treinos (programa de academia compartilhado, desempenho individual)
-- =============================================================================
-- Modelo TEMPORÁRIO e seguro enquanto o compartilhamento de workspace (convites)
-- não existe — esta migration NÃO depende dela:
--
--   * A rotina (dias A–E e exercícios) pertence ao workspace.
--   * Cada atleta (Lucas, Matheus) é uma linha de workout_athletes DENTRO do
--     workspace. user_id é nulo hoje e será preenchido quando o usuário do
--     Matheus for associado ao workspace. Nada mais precisa mudar nesse dia.
--   * Cargas atuais, sessões, séries e peso corporal referenciam athlete_id —
--     nunca o usuário logado —, mantendo os históricos de Lucas e Matheus
--     separados mesmo usando o mesmo aparelho/conta.
--
-- Os dados da planilha NÃO são semeados aqui. Atletas e dias A–E são criados
-- de forma idempotente por WorkoutCommands.ensureBase e os exercícios entram
-- pela importação explícita (que sinaliza valores ambíguos), porque uma
-- migration só alcançaria os workspaces já existentes (mesmo raciocínio de
-- shopping_lists e learning_courses).
--
-- Remoção de exercício é lógica (removed_at) e ocultar é reversível (hidden_at):
-- o histórico de séries continua referenciando o exercício.
--
-- Segurança: RLS por is_workspace_member em todas as tabelas + GRANTs
-- explícitos (o projeto não expõe tabelas novas automaticamente — ver
-- 20260722140000_api_role_grants.sql).
-- =============================================================================

-- ATLETAS --------------------------------------------------------------------
create table public.workout_athletes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  user_id uuid references auth.users (id) on delete set null,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);
create index workout_athletes_workspace_idx on public.workout_athletes (workspace_id);
create trigger workout_athletes_updated_at
  before update on public.workout_athletes
  for each row execute function public.set_updated_at();

-- DIAS (A–E) -----------------------------------------------------------------
create table public.workout_days (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  code text not null check (length(btrim(code)) between 1 and 4),
  title text check (title is null or length(title) <= 80),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, code)
);
create trigger workout_days_updated_at
  before update on public.workout_days
  for each row execute function public.set_updated_at();

-- EXERCÍCIOS DA ROTINA -------------------------------------------------------
create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  day_id uuid not null references public.workout_days (id) on delete cascade,
  position integer not null default 0 check (position >= 0),
  name text not null check (length(btrim(name)) between 1 and 120),
  sets integer not null check (sets between 1 and 20),
  reps_min integer check (reps_min is null or reps_min between 1 and 999),
  reps_max integer check (reps_max is null or reps_max between 1 and 999),
  reps_note text check (reps_note is null or length(reps_note) <= 120),
  rest_seconds integer check (rest_seconds is null or rest_seconds between 0 and 1800),
  rest_note text check (rest_note is null or length(rest_note) <= 60),
  instructions text check (instructions is null or length(instructions) <= 1000),
  image_url text check (image_url is null or image_url ~* '^https?://'),
  video_url text check (video_url is null or video_url ~* '^https?://'),
  source_note text check (source_note is null or length(source_note) <= 500),
  needs_review boolean not null default false,
  hidden_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reps_min is null or reps_max is null or reps_min <= reps_max)
);
create index workout_exercises_day_idx on public.workout_exercises (workspace_id, day_id, position);
create trigger workout_exercises_updated_at
  before update on public.workout_exercises
  for each row execute function public.set_updated_at();

-- CARGA ATUAL POR ATLETA -----------------------------------------------------
create table public.workout_exercise_loads (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  athlete_id uuid not null references public.workout_athletes (id) on delete cascade,
  load_kg numeric(6, 2) check (load_kg is null or load_kg between 0 and 1000),
  load_note text check (load_note is null or length(load_note) <= 60),
  updated_at timestamptz not null default now(),
  primary key (exercise_id, athlete_id)
);
create index workout_exercise_loads_workspace_idx on public.workout_exercise_loads (workspace_id);

-- SESSÕES --------------------------------------------------------------------
-- rest_* guardam a contagem regressiva do descanso como timestamps: recarregar
-- a página ou navegar não perde o prazo, e os mesmos campos poderão alimentar
-- uma Live Activity (iOS) no futuro.
create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  athlete_id uuid not null references public.workout_athletes (id) on delete cascade,
  day_id uuid not null references public.workout_days (id) on delete cascade,
  session_date date not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'cancelled')),
  rest_ends_at timestamptz,
  rest_duration_seconds integer check (rest_duration_seconds is null or rest_duration_seconds between 0 and 1800),
  rest_paused_remaining_seconds integer
    check (rest_paused_remaining_seconds is null or rest_paused_remaining_seconds between 0 and 1800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workout_sessions_athlete_idx on public.workout_sessions (athlete_id, started_at desc);
-- No máximo um treino em andamento por atleta, mesmo sob corrida.
create unique index workout_sessions_one_active_idx
  on public.workout_sessions (athlete_id) where status = 'in_progress';
create trigger workout_sessions_updated_at
  before update on public.workout_sessions
  for each row execute function public.set_updated_at();

-- SÉRIES REGISTRADAS ---------------------------------------------------------
create table public.workout_set_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  athlete_id uuid not null references public.workout_athletes (id) on delete cascade,
  exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  set_number integer not null check (set_number between 1 and 30),
  load_kg numeric(6, 2) check (load_kg is null or load_kg between 0 and 1000),
  reps integer not null check (reps between 0 and 999),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (session_id, exercise_id, set_number)
);
create index workout_set_logs_athlete_idx on public.workout_set_logs (athlete_id, completed_at desc);
create index workout_set_logs_session_idx on public.workout_set_logs (session_id);

-- PESO CORPORAL --------------------------------------------------------------
create table public.workout_body_weights (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  athlete_id uuid not null references public.workout_athletes (id) on delete cascade,
  weight_kg numeric(5, 2) not null check (weight_kg between 20 and 400),
  logged_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, logged_on)
);
create index workout_body_weights_athlete_idx on public.workout_body_weights (athlete_id, logged_on desc);
create trigger workout_body_weights_updated_at
  before update on public.workout_body_weights
  for each row execute function public.set_updated_at();

-- RLS ------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'workout_athletes',
    'workout_days',
    'workout_exercises',
    'workout_exercise_loads',
    'workout_sessions',
    'workout_set_logs',
    'workout_body_weights'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_workspace_member(workspace_id))',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_workspace_member(workspace_id))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id))',
      t || '_update', t);
  end loop;
end
$$;

-- Apenas séries e peso corporal podem ser apagados (desfazer um registro).
create policy "workout_set_logs_delete" on public.workout_set_logs
  for delete to authenticated using (public.is_workspace_member(workspace_id));
create policy "workout_body_weights_delete" on public.workout_body_weights
  for delete to authenticated using (public.is_workspace_member(workspace_id));

-- GRANTS ---------------------------------------------------------------------
grant select, insert, update on public.workout_athletes to authenticated;
grant select, insert, update on public.workout_days to authenticated;
grant select, insert, update on public.workout_exercises to authenticated;
grant select, insert, update on public.workout_exercise_loads to authenticated;
grant select, insert, update on public.workout_sessions to authenticated;
grant select, insert, update, delete on public.workout_set_logs to authenticated;
grant select, insert, update, delete on public.workout_body_weights to authenticated;

-- REALTIME -------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'workout_athletes',
    'workout_days',
    'workout_exercises',
    'workout_exercise_loads',
    'workout_sessions',
    'workout_set_logs',
    'workout_body_weights'
  ];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

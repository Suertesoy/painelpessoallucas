-- =============================================================================
-- Migration: Learning Engine (Fase 1 do módulo Aprendizado)
-- =============================================================================
-- Motor de aprendizado genérico, reutilizável por vários cursos. Japonês é
-- apenas o primeiro registro em learning_courses — nada aqui é hardcoded para
-- um idioma específico, exceto as colunas de exibição (romaji/furigana/
-- tradução) em learning_course_preferences, que são propositalmente
-- específicas de CURSO (não do motor), para não contaminar o domínio geral
-- com conceitos que só fazem sentido para idiomas com escrita não-latina.
--
-- Seed do curso Japonês: NÃO é feito aqui. Um seed nesta migration só
-- alcançaria os workspaces que já existem no momento em que ela roda — todo
-- workspace criado depois (todo novo usuário) ficaria sem curso. Por isso o
-- cadastro do curso é responsabilidade do Command idempotente
-- `LearningCommands.initializeDefaultLearningContent`, chamado pela página
-- /aprendizado no primeiro acesso (mesmo padrão de `ensure_personal_workspace`
-- para o workspace pessoal).
--
-- Todas as tabelas replicam workspace_id diretamente (mesmo padrão de
-- plan_phases/plan_actions em 20260717090000_plans_schema.sql), o que permite
-- a mesma policy simples de RLS baseada em `is_workspace_member` em todas.
-- =============================================================================

-- =============================================================================
-- LEARNING_COURSES
-- =============================================================================
create table public.learning_courses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  slug text not null,
  title text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  daily_goal_minutes integer not null default 15
    check (daily_goal_minutes between 5 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create index learning_courses_workspace_idx on public.learning_courses (workspace_id);

create trigger learning_courses_updated_at
  before update on public.learning_courses
  for each row execute function public.set_updated_at();

-- =============================================================================
-- LEARNING_MODULES
-- =============================================================================
create table public.learning_modules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  course_id uuid not null references public.learning_courses (id) on delete cascade,
  title text not null,
  description text,
  position integer not null default 0,
  status text not null default 'locked'
    check (status in ('locked', 'available', 'in_progress', 'completed')),
  lessons_count integer not null default 0 check (lessons_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, position)
);

create index learning_modules_course_idx on public.learning_modules (course_id);

create trigger learning_modules_updated_at
  before update on public.learning_modules
  for each row execute function public.set_updated_at();

-- =============================================================================
-- LEARNING_PREFERENCES (gerais, uma linha por workspace)
-- =============================================================================
create table public.learning_preferences (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  default_daily_goal_minutes integer not null default 15
    check (default_daily_goal_minutes between 5 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger learning_preferences_updated_at
  before update on public.learning_preferences
  for each row execute function public.set_updated_at();

-- =============================================================================
-- LEARNING_COURSE_PREFERENCES (específicas de curso: romaji/furigana/tradução)
-- =============================================================================
create table public.learning_course_preferences (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  course_id uuid not null references public.learning_courses (id) on delete cascade,
  show_romaji boolean not null default true,
  show_furigana boolean not null default true,
  show_translation boolean not null default true,
  auto_play_audio boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, course_id)
);

create trigger learning_course_preferences_updated_at
  before update on public.learning_course_preferences
  for each row execute function public.set_updated_at();

-- =============================================================================
-- STUDY_SESSIONS
-- =============================================================================
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  course_id uuid not null references public.learning_courses (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_minutes integer check (duration_minutes > 0 and duration_minutes <= 600),
  status text not null default 'in_progress'
    check (status in ('planned', 'in_progress', 'completed', 'cancelled')),
  source text not null default 'manual' check (source in ('manual', 'session_flow')),
  daily_goal_minutes_snapshot integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index study_sessions_workspace_idx on public.study_sessions (workspace_id, started_at desc);
create index study_sessions_course_idx on public.study_sessions (course_id);

-- Garante no máximo uma sessão em andamento por workspace mesmo sob corrida
-- (o Command já verifica antes de criar; este índice é a garantia no banco).
create unique index study_sessions_one_active_idx on public.study_sessions (workspace_id)
  where status = 'in_progress';

create trigger study_sessions_updated_at
  before update on public.study_sessions
  for each row execute function public.set_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.learning_courses enable row level security;
alter table public.learning_modules enable row level security;
alter table public.learning_preferences enable row level security;
alter table public.learning_course_preferences enable row level security;
alter table public.study_sessions enable row level security;

-- learning_courses
create policy "learning_courses_select" on public.learning_courses
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "learning_courses_insert" on public.learning_courses
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "learning_courses_update" on public.learning_courses
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "learning_courses_delete" on public.learning_courses
  for delete to authenticated using (public.is_workspace_member(workspace_id));

-- learning_modules
create policy "learning_modules_select" on public.learning_modules
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "learning_modules_insert" on public.learning_modules
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "learning_modules_update" on public.learning_modules
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "learning_modules_delete" on public.learning_modules
  for delete to authenticated using (public.is_workspace_member(workspace_id));

-- learning_preferences
create policy "learning_preferences_select" on public.learning_preferences
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "learning_preferences_insert" on public.learning_preferences
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "learning_preferences_update" on public.learning_preferences
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- learning_course_preferences
create policy "learning_course_preferences_select" on public.learning_course_preferences
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "learning_course_preferences_insert" on public.learning_course_preferences
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "learning_course_preferences_update" on public.learning_course_preferences
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- study_sessions
create policy "study_sessions_select" on public.study_sessions
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "study_sessions_insert" on public.study_sessions
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "study_sessions_update" on public.study_sessions
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- =============================================================================
-- GRANTS — o projeto Supabase não expõe tabelas novas automaticamente (ver
-- 20260722140000_api_role_grants.sql); sem isto, toda operação falha com
-- "permission denied" mesmo com RLS e policies corretas.
-- =============================================================================
grant select, insert, update, delete on public.learning_courses to authenticated;
grant select, insert, update, delete on public.learning_modules to authenticated;
-- learning_preferences/learning_course_preferences: sem delete — preferências
-- são atualizadas, nunca removidas (mesmo padrão de workspace_settings).
grant select, insert, update on public.learning_preferences to authenticated;
grant select, insert, update on public.learning_course_preferences to authenticated;
grant select, insert, update on public.study_sessions to authenticated;

-- =============================================================================
-- Migration: Schema core (Fase 2 — Persistência remota e autenticação)
-- Tabelas: profiles, workspaces, workspace_members, projects, items,
--          daily_plans, daily_plan_items, item_relations, domain_events
-- Convenções:
--   - timestamptz para instantes; date para datas sem horário.
--   - Todas as tabelas de domínio: id, workspace_id, created_at, updated_at.
--   - RLS ativa em todas as tabelas; acesso apenas para membros do workspace.
-- =============================================================================

-- Extensões -------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- Função utilitária: updated_at automático -----------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- PROFILES (1:1 com auth.users)
-- =============================================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- =============================================================================
-- WORKSPACES + MEMBERS
-- =============================================================================
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger workspaces_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index workspace_members_user_idx on public.workspace_members (user_id);

create trigger workspace_members_updated_at
  before update on public.workspace_members
  for each row execute function public.set_updated_at();

-- Helper de autorização: usuário autenticado é membro do workspace? ----------
-- SECURITY DEFINER para evitar recursão de RLS em workspace_members.
create or replace function public.is_workspace_member(ws_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = ws_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_workspace_member(uuid) from anon;

-- =============================================================================
-- PROJECTS
-- =============================================================================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  description text,
  objective text,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'archived')),
  attention_level text not null default 'normal'
    check (attention_level in ('normal', 'attention', 'critical')),
  next_milestone text,
  due_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  deleted_at timestamptz
);

create index projects_workspace_idx on public.projects (workspace_id) where deleted_at is null;

create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- =============================================================================
-- ITEMS
-- =============================================================================
create table public.items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  title text,
  content text,
  type text not null default 'note'
    check (type in ('task', 'idea', 'insight', 'decision', 'reminder', 'reference', 'note')),
  status text not null default 'inbox'
    check (status in ('inbox', 'organized', 'planned', 'in_progress', 'blocked', 'completed', 'archived')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'critical')),
  due_at timestamptz,
  scheduled_at timestamptz,
  estimated_minutes integer check (estimated_minutes > 0),
  next_action text,
  source text not null default 'manual'
    check (source in ('quick_capture', 'manual', 'import', 'ai', 'integration', 'mcp', 'automation')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,
  constraint items_title_or_content check (title is not null or content is not null)
);

create index items_workspace_idx on public.items (workspace_id) where deleted_at is null;
create index items_project_idx on public.items (project_id) where deleted_at is null;
create index items_status_idx on public.items (workspace_id, status) where deleted_at is null;

create trigger items_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- =============================================================================
-- DAILY PLANS (foco do dia) + ITENS DO PLANO
-- =============================================================================
create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, date)
);

create trigger daily_plans_updated_at
  before update on public.daily_plans
  for each row execute function public.set_updated_at();

create table public.daily_plan_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  daily_plan_id uuid not null references public.daily_plans (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (daily_plan_id, item_id)
);

create index daily_plan_items_plan_idx on public.daily_plan_items (daily_plan_id);

create trigger daily_plan_items_updated_at
  before update on public.daily_plan_items
  for each row execute function public.set_updated_at();

-- =============================================================================
-- ITEM RELATIONS (ex.: ideia → tarefa)
-- =============================================================================
create table public.item_relations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  from_item_id uuid not null references public.items (id) on delete cascade,
  to_item_id uuid not null references public.items (id) on delete cascade,
  relation_type text not null default 'related'
    check (relation_type in ('related', 'origin_of', 'derived_from', 'blocks', 'blocked_by')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (from_item_id, to_item_id, relation_type)
);

create index item_relations_workspace_idx on public.item_relations (workspace_id);

create trigger item_relations_updated_at
  before update on public.item_relations
  for each row execute function public.set_updated_at();

-- =============================================================================
-- DOMAIN EVENTS (append-only / outbox)
-- =============================================================================
create table public.domain_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  type text not null,
  entity_id text not null,
  source text not null default 'manual',
  payload jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index domain_events_workspace_idx on public.domain_events (workspace_id, created_at desc);
create index domain_events_unprocessed_idx on public.domain_events (created_at)
  where processed_at is null;

-- =============================================================================
-- BOOTSTRAP: novo usuário → profile + workspace pessoal + membership
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws_id uuid;
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.workspaces (name, created_by)
  values ('Pessoal', new.id)
  returning id into ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws_id, new.id, 'owner')
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Fallback idempotente para usuários já existentes sem workspace -------------
create or replace function public.ensure_personal_workspace()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  ws_id uuid;
begin
  if uid is null then
    raise exception 'Não autenticado';
  end if;

  select m.workspace_id into ws_id
  from public.workspace_members m
  where m.user_id = uid
  order by m.created_at
  limit 1;

  if ws_id is not null then
    return ws_id;
  end if;

  insert into public.profiles (id, email)
  select u.id, coalesce(u.email, '')
  from auth.users u
  where u.id = uid
  on conflict (id) do nothing;

  insert into public.workspaces (name, created_by)
  values ('Pessoal', uid)
  returning id into ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws_id, uid, 'owner');

  return ws_id;
end;
$$;

revoke all on function public.ensure_personal_workspace() from anon;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.items enable row level security;
alter table public.daily_plans enable row level security;
alter table public.daily_plan_items enable row level security;
alter table public.item_relations enable row level security;
alter table public.domain_events enable row level security;

-- profiles: cada usuário vê e edita apenas o próprio perfil
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- workspaces: membros podem ver; apenas owners atualizam
create policy "workspaces_select_member" on public.workspaces
  for select to authenticated
  using (public.is_workspace_member(id));

create policy "workspaces_update_owner" on public.workspaces
  for update to authenticated
  using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
  );

-- workspace_members: membros veem a lista de membros do próprio workspace
create policy "workspace_members_select_member" on public.workspace_members
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- Tabelas de domínio: CRUD completo para membros do workspace ----------------
-- projects
create policy "projects_select" on public.projects
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "projects_insert" on public.projects
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "projects_update" on public.projects
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "projects_delete" on public.projects
  for delete to authenticated using (public.is_workspace_member(workspace_id));

-- items
create policy "items_select" on public.items
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "items_insert" on public.items
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "items_update" on public.items
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "items_delete" on public.items
  for delete to authenticated using (public.is_workspace_member(workspace_id));

-- daily_plans
create policy "daily_plans_select" on public.daily_plans
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "daily_plans_insert" on public.daily_plans
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "daily_plans_update" on public.daily_plans
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "daily_plans_delete" on public.daily_plans
  for delete to authenticated using (public.is_workspace_member(workspace_id));

-- daily_plan_items
create policy "daily_plan_items_select" on public.daily_plan_items
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "daily_plan_items_insert" on public.daily_plan_items
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "daily_plan_items_update" on public.daily_plan_items
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "daily_plan_items_delete" on public.daily_plan_items
  for delete to authenticated using (public.is_workspace_member(workspace_id));

-- item_relations
create policy "item_relations_select" on public.item_relations
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "item_relations_insert" on public.item_relations
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "item_relations_update" on public.item_relations
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "item_relations_delete" on public.item_relations
  for delete to authenticated using (public.is_workspace_member(workspace_id));

-- domain_events: membros inserem e leem; eventos são imutáveis (sem update/delete)
create policy "domain_events_select" on public.domain_events
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "domain_events_insert" on public.domain_events
  for insert to authenticated with check (public.is_workspace_member(workspace_id));

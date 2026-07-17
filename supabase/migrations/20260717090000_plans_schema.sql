-- =============================================================================
-- Migration: Documentos e planos de execução (Fase 2 — Etapa 3)
-- Tabelas: source_documents, execution_plans, plan_phases, plan_actions,
--          recurrence_rules, reminders, notifications
-- Também: colunas de proveniência em items (ocorrências materializadas).
-- =============================================================================

-- =============================================================================
-- SOURCE DOCUMENTS (documento original importado — nunca é perdido)
-- =============================================================================
create table public.source_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  title text not null,
  document_type text not null default 'other'
    check (document_type in ('personal_guide', 'project_plan', 'meeting_notes', 'strategy', 'reference', 'other')),
  original_content text not null,
  content_hash text not null,
  source text not null default 'paste'
    check (source in ('paste', 'file_md', 'file_txt')),
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'queued', 'processing', 'completed', 'failed')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index source_documents_workspace_idx on public.source_documents (workspace_id) where deleted_at is null;

create trigger source_documents_updated_at
  before update on public.source_documents
  for each row execute function public.set_updated_at();

-- =============================================================================
-- EXECUTION PLANS (o plano aprovado é a definição; tarefas são ocorrências)
-- =============================================================================
create table public.execution_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  source_document_id uuid references public.source_documents (id) on delete set null,
  name text not null,
  objective text,
  status text not null default 'draft'
    check (status in ('draft', 'awaiting_review', 'approved', 'active', 'paused', 'completed', 'archived')),
  start_date date,
  target_date date,
  timezone text not null default 'America/Sao_Paulo',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz
);

create index execution_plans_workspace_idx on public.execution_plans (workspace_id) where deleted_at is null;
create index execution_plans_project_idx on public.execution_plans (project_id) where deleted_at is null;

create trigger execution_plans_updated_at
  before update on public.execution_plans
  for each row execute function public.set_updated_at();

-- =============================================================================
-- PLAN PHASES
-- =============================================================================
create table public.plan_phases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  execution_plan_id uuid not null references public.execution_plans (id) on delete cascade,
  name text not null,
  description text,
  position integer not null default 0,
  start_offset_days integer,
  duration_days integer,
  milestone text,
  success_criteria text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plan_phases_plan_idx on public.plan_phases (execution_plan_id, position);

create trigger plan_phases_updated_at
  before update on public.plan_phases
  for each row execute function public.set_updated_at();

-- =============================================================================
-- RECURRENCE RULES (determinísticas; materialização na Etapa 5)
-- =============================================================================
create table public.recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  execution_plan_id uuid references public.execution_plans (id) on delete cascade,
  frequency text not null
    check (frequency in ('daily', 'weekly', 'monthly', 'once', 'relative_to_plan_start', 'relative_to_phase_start', 'relative_to_event')),
  interval integer not null default 1 check (interval >= 1),
  days_of_week integer[] default null, -- 0=domingo … 6=sábado
  day_of_month integer check (day_of_month between 1 and 31),
  local_time time,
  timezone text not null default 'America/Sao_Paulo',
  start_at timestamptz,
  end_at timestamptz,
  max_occurrences integer check (max_occurrences > 0),
  next_occurrence_at timestamptz,
  last_occurrence_at timestamptz,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recurrence_rules_due_idx on public.recurrence_rules (next_occurrence_at)
  where is_active = true;
create index recurrence_rules_workspace_idx on public.recurrence_rules (workspace_id);

create trigger recurrence_rules_updated_at
  before update on public.recurrence_rules
  for each row execute function public.set_updated_at();

-- =============================================================================
-- PLAN ACTIONS
-- =============================================================================
create table public.plan_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  execution_plan_id uuid not null references public.execution_plans (id) on delete cascade,
  phase_id uuid references public.plan_phases (id) on delete set null,
  title text not null,
  description text,
  action_type text not null default 'task'
    check (action_type in ('task', 'routine', 'reminder', 'milestone', 'decision', 'waiting')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'critical')),
  estimated_minutes integer check (estimated_minutes > 0),
  due_rule jsonb,       -- ex.: { "type": "offset_from_start", "days": 7 } | { "type": "fixed", "date": "2026-08-01" }
  schedule_rule jsonb,  -- ex.: { "type": "fixed_time", "time": "08:00" }
  recurrence_rule_id uuid references public.recurrence_rules (id) on delete set null,
  dependency_action_ids uuid[] not null default '{}',
  waiting_on text,
  requires_confirmation boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plan_actions_plan_idx on public.plan_actions (execution_plan_id, position);
create index plan_actions_phase_idx on public.plan_actions (phase_id);

create trigger plan_actions_updated_at
  before update on public.plan_actions
  for each row execute function public.set_updated_at();

-- =============================================================================
-- REMINDERS
-- =============================================================================
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  item_id uuid references public.items (id) on delete cascade,
  plan_action_id uuid references public.plan_actions (id) on delete cascade,
  message text not null,
  remind_at timestamptz not null,
  channel text not null default 'app' check (channel in ('app', 'email')),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'dismissed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reminders_due_idx on public.reminders (remind_at) where status = 'pending';
create index reminders_workspace_idx on public.reminders (workspace_id);

create trigger reminders_updated_at
  before update on public.reminders
  for each row execute function public.set_updated_at();

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notifications_workspace_idx on public.notifications (workspace_id, created_at desc);
create index notifications_unread_idx on public.notifications (workspace_id) where read_at is null;

create trigger notifications_updated_at
  before update on public.notifications
  for each row execute function public.set_updated_at();

-- =============================================================================
-- ITEMS: proveniência de ocorrências materializadas (planos e recorrências)
-- =============================================================================
alter table public.items
  add column execution_plan_id uuid references public.execution_plans (id) on delete set null,
  add column plan_phase_id uuid references public.plan_phases (id) on delete set null,
  add column plan_action_id uuid references public.plan_actions (id) on delete set null,
  add column recurrence_rule_id uuid references public.recurrence_rules (id) on delete set null,
  add column occurrence_at timestamptz;

-- Nunca gerar a mesma ocorrência duas vezes (chave natural da materialização).
create unique index items_occurrence_unique_idx
  on public.items (recurrence_rule_id, occurrence_at)
  where recurrence_rule_id is not null and occurrence_at is not null;

create index items_plan_idx on public.items (execution_plan_id) where execution_plan_id is not null;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.source_documents enable row level security;
alter table public.execution_plans enable row level security;
alter table public.plan_phases enable row level security;
alter table public.plan_actions enable row level security;
alter table public.recurrence_rules enable row level security;
alter table public.reminders enable row level security;
alter table public.notifications enable row level security;

-- source_documents
create policy "source_documents_select" on public.source_documents
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "source_documents_insert" on public.source_documents
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "source_documents_update" on public.source_documents
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "source_documents_delete" on public.source_documents
  for delete to authenticated using (public.is_workspace_member(workspace_id));

-- execution_plans
create policy "execution_plans_select" on public.execution_plans
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "execution_plans_insert" on public.execution_plans
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "execution_plans_update" on public.execution_plans
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "execution_plans_delete" on public.execution_plans
  for delete to authenticated using (public.is_workspace_member(workspace_id));

-- plan_phases
create policy "plan_phases_select" on public.plan_phases
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "plan_phases_insert" on public.plan_phases
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "plan_phases_update" on public.plan_phases
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "plan_phases_delete" on public.plan_phases
  for delete to authenticated using (public.is_workspace_member(workspace_id));

-- plan_actions
create policy "plan_actions_select" on public.plan_actions
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "plan_actions_insert" on public.plan_actions
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "plan_actions_update" on public.plan_actions
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "plan_actions_delete" on public.plan_actions
  for delete to authenticated using (public.is_workspace_member(workspace_id));

-- recurrence_rules
create policy "recurrence_rules_select" on public.recurrence_rules
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "recurrence_rules_insert" on public.recurrence_rules
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "recurrence_rules_update" on public.recurrence_rules
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "recurrence_rules_delete" on public.recurrence_rules
  for delete to authenticated using (public.is_workspace_member(workspace_id));

-- reminders
create policy "reminders_select" on public.reminders
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "reminders_insert" on public.reminders
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "reminders_update" on public.reminders
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "reminders_delete" on public.reminders
  for delete to authenticated using (public.is_workspace_member(workspace_id));

-- notifications
create policy "notifications_select" on public.notifications
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "notifications_insert" on public.notifications
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "notifications_update" on public.notifications
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "notifications_delete" on public.notifications
  for delete to authenticated using (public.is_workspace_member(workspace_id));

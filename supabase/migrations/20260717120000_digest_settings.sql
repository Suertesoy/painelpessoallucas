-- =============================================================================
-- Migration: Preferências de resumos por e-mail (Fase 2 — Etapa 7: Gmail)
-- Nada é enviado sem o usuário ativar explicitamente a preferência.
-- =============================================================================

create table public.workspace_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  daily_digest_enabled boolean not null default false,
  daily_digest_time time not null default '07:30',
  weekly_digest_enabled boolean not null default false,
  weekly_digest_day integer not null default 1 check (weekly_digest_day between 0 and 6), -- 0=domingo
  weekly_digest_time time not null default '08:00',
  critical_alerts_enabled boolean not null default false,
  digest_recipient text,
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id)
);

create trigger workspace_settings_updated_at
  before update on public.workspace_settings
  for each row execute function public.set_updated_at();

alter table public.workspace_settings enable row level security;

create policy "workspace_settings_select" on public.workspace_settings
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "workspace_settings_insert" on public.workspace_settings
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "workspace_settings_update" on public.workspace_settings
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

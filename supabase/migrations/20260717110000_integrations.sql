-- =============================================================================
-- Migration: Integrações Google (Fase 2 — Etapa 6)
-- integration_accounts (conexão por serviço) + integration_tokens (segredos
-- criptografados, NUNCA expostos ao navegador) + calendar_event_links.
-- =============================================================================

create table public.integration_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'google' check (provider in ('google')),
  service text not null check (service in ('calendar', 'gmail')),
  external_account_email text,
  scopes text[] not null default '{}',
  status text not null default 'connected'
    check (status in ('connected', 'revoked', 'error', 'disconnected')),
  last_error text,
  connected_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, service)
);

create trigger integration_accounts_updated_at
  before update on public.integration_accounts
  for each row execute function public.set_updated_at();

-- Tokens em tabela separada: RLS nega TODO acesso do cliente; somente o
-- servidor (secret key) lê/escreve. Valores criptografados (AES-256-GCM).
create table public.integration_tokens (
  id uuid primary key default gen_random_uuid(),
  integration_account_id uuid not null references public.integration_accounts (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  access_token_expires_at timestamptz,
  token_type text default 'Bearer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_account_id)
);

create trigger integration_tokens_updated_at
  before update on public.integration_tokens
  for each row execute function public.set_updated_at();

-- Vínculo item ↔ evento do Google Calendar
create table public.calendar_event_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  google_calendar_id text not null,
  google_event_id text not null,
  etag text,
  last_synced_at timestamptz,
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced', 'error', 'deleted')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id),
  unique (google_calendar_id, google_event_id)
);

create index calendar_event_links_workspace_idx on public.calendar_event_links (workspace_id);
create index calendar_event_links_pending_idx on public.calendar_event_links (workspace_id)
  where sync_status in ('pending', 'error');

create trigger calendar_event_links_updated_at
  before update on public.calendar_event_links
  for each row execute function public.set_updated_at();

-- Preferência de sincronização por item e por plano ---------------------------
alter table public.items
  add column calendar_sync text not null default 'none'
    check (calendar_sync in ('none', 'sync', 'sync_reminder'));

alter table public.execution_plans
  add column calendar_sync_scope text not null default 'none'
    check (calendar_sync_scope in ('none', 'milestones', 'timed', 'all', 'manual'));

-- ID do calendário "Painel Lucas" criado pela aplicação (por workspace)
alter table public.integration_accounts
  add column app_calendar_id text;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.integration_accounts enable row level security;
alter table public.integration_tokens enable row level security;
alter table public.calendar_event_links enable row level security;

-- integration_accounts: membro vê status/metadata (sem tokens aqui)
create policy "integration_accounts_select" on public.integration_accounts
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "integration_accounts_insert" on public.integration_accounts
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "integration_accounts_update" on public.integration_accounts
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "integration_accounts_delete" on public.integration_accounts
  for delete to authenticated using (public.is_workspace_member(workspace_id));

-- integration_tokens: NENHUMA policy para authenticated ⇒ acesso somente com
-- a secret key do servidor (service role bypassa RLS). Tokens jamais chegam
-- ao navegador.

-- calendar_event_links
create policy "calendar_event_links_select" on public.calendar_event_links
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "calendar_event_links_insert" on public.calendar_event_links
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "calendar_event_links_update" on public.calendar_event_links
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "calendar_event_links_delete" on public.calendar_event_links
  for delete to authenticated using (public.is_workspace_member(workspace_id));

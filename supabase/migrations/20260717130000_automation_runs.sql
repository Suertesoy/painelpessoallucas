-- =============================================================================
-- Migration: automation_runs (Fase 2 — Etapa 8: execuções agendadas)
-- Idempotência garantida por constraint única no banco (não pela memória da
-- função): o mesmo trabalho nunca executa duas vezes.
-- =============================================================================

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  automation_type text not null,
  idempotency_key text not null,
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'skipped')),
  attempt integer not null default 0,
  input jsonb,
  result jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, automation_type, idempotency_key)
);

create index automation_runs_workspace_idx on public.automation_runs (workspace_id, created_at desc);
create index automation_runs_retry_idx on public.automation_runs (status, attempt)
  where status = 'failed';

create trigger automation_runs_updated_at
  before update on public.automation_runs
  for each row execute function public.set_updated_at();

alter table public.automation_runs enable row level security;

-- Membros podem VER as execuções do próprio workspace; escrita somente pelo
-- servidor (secret key bypassa RLS — nenhuma policy de escrita para cliente).
create policy "automation_runs_select" on public.automation_runs
  for select to authenticated using (public.is_workspace_member(workspace_id));

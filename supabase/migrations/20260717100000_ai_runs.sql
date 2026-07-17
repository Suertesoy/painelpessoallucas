-- =============================================================================
-- Migration: ai_runs (Fase 2 — Etapa 4: OpenAI)
-- Registro auditável de todas as execuções de IA (sem segredos, sem prompts
-- contendo chaves). A resposta estruturada validada fica em response_metadata.
-- =============================================================================

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  source_document_id uuid references public.source_documents (id) on delete set null,
  execution_plan_id uuid references public.execution_plans (id) on delete set null,
  provider text not null default 'openai',
  model text not null,
  operation text not null, -- ex.: 'plan_import'
  prompt_version text not null,
  input_hash text not null,
  started_at timestamptz,
  completed_at timestamptz,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed')),
  input_tokens integer,
  output_tokens integer,
  estimated_cost numeric(12, 6),
  latency_ms integer,
  error_code text,
  error_message text,
  response_metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_runs_workspace_idx on public.ai_runs (workspace_id, created_at desc);
create index ai_runs_plan_idx on public.ai_runs (execution_plan_id) where execution_plan_id is not null;
create index ai_runs_document_idx on public.ai_runs (source_document_id) where source_document_id is not null;

create trigger ai_runs_updated_at
  before update on public.ai_runs
  for each row execute function public.set_updated_at();

alter table public.ai_runs enable row level security;

-- Membros do workspace podem ver e registrar execuções; runs são imutáveis
-- para o cliente após conclusão (update permitido para transição de status
-- feita pelo servidor com a sessão do usuário).
create policy "ai_runs_select" on public.ai_runs
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "ai_runs_insert" on public.ai_runs
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "ai_runs_update" on public.ai_runs
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

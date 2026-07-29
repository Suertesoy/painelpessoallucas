-- =============================================================================
-- Migration: Web Push (Fase 2.2) — push_subscriptions, push_deliveries e
-- extensão mínima de notifications/reminders.
-- =============================================================================
-- push_subscriptions guarda a credencial de entrega (endpoint + p256dh + auth)
-- de cada dispositivo. Endpoint/p256dh/auth são sensíveis (permitem enviar
-- push para o dispositivo do usuário) — por isso, igual a integration_tokens,
-- NENHUMA policy de RLS é criada para "authenticated": só o service_role
-- (cliente admin, server-only) lê/escreve esta tabela. Toda rota que expõe
-- estado de assinatura ao navegador faz isso através de uma projeção
-- sanitizada (sem endpoint/p256dh/auth), nunca da tabela crua.
--
-- push_deliveries é a outbox de envio: uma linha por (notification, device),
-- nunca lida diretamente pelo navegador.
-- =============================================================================

-- =============================================================================
-- PUSH SUBSCRIPTIONS
-- =============================================================================
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Credencial de entrega (sensível — nunca exposta ao navegador após o cadastro).
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,

  device_name text not null default 'Este dispositivo',
  platform text not null default 'other'
    check (platform in ('ios', 'android', 'desktop', 'other')),

  -- Estado ativo/desativado (par com disabled_at: is_active = false sempre
  -- que disabled_at estiver preenchido — mantidos como colunas separadas
  -- para leitura simples nas queries de recuperação/entrega).
  is_active boolean not null default true,
  disabled_at timestamptz,

  -- Preferências por categoria — TODAS começam desativadas (opt-in real).
  task_reminders_enabled boolean not null default false,
  daily_planning_enabled boolean not null default false,
  daily_planning_time time not null default '08:00',
  weekly_review_enabled boolean not null default false,
  weekly_review_day integer not null default 1 check (weekly_review_day between 0 and 6), -- 0=domingo
  weekly_review_time time not null default '09:00',
  capture_failure_enabled boolean not null default false,

  -- Privacidade do conteúdo — começa desativada (texto genérico por padrão).
  show_details_enabled boolean not null default false,

  timezone text not null default 'America/Sao_Paulo',

  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (endpoint)
);

create index push_subscriptions_active_idx on public.push_subscriptions (workspace_id)
  where is_active = true and disabled_at is null;
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create trigger push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

-- =============================================================================
-- PUSH DELIVERIES (outbox de envio)
-- =============================================================================
create table public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'cancelled')),
  attempt integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  -- Categoria sanitizada — nunca a mensagem crua do serviço de push.
  error_category text
    check (error_category in ('expired_subscription', 'rate_limited', 'payload_too_large', 'network_error', 'server_error', 'unknown_error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Nunca envia a mesma notificação duas vezes ao mesmo dispositivo.
  unique (notification_id, subscription_id)
);

create index push_deliveries_pending_idx on public.push_deliveries (next_attempt_at)
  where status = 'pending';
create index push_deliveries_subscription_idx on public.push_deliveries (subscription_id);

create trigger push_deliveries_updated_at
  before update on public.push_deliveries
  for each row execute function public.set_updated_at();

-- =============================================================================
-- NOTIFICATIONS: dedup_key + destino interno + metadados mínimos
-- =============================================================================
alter table public.notifications
  add column dedup_key text,
  add column target_url text,
  add column metadata jsonb;

-- Deduplicação por workspace: a mesma dedup_key nunca gera duas notificações
-- no mesmo workspace (índice único parcial — múltiplas linhas com
-- dedup_key nulo não conflitam entre si).
create unique index notifications_dedup_idx
  on public.notifications (workspace_id, dedup_key)
  where dedup_key is not null;

-- =============================================================================
-- REMINDERS: canal 'push' (sem afetar os valores existentes 'app'/'email')
-- =============================================================================
alter table public.reminders
  drop constraint reminders_channel_check;

alter table public.reminders
  add constraint reminders_channel_check
  check (channel in ('app', 'email', 'push'));

-- =============================================================================
-- AI_RUNS: índice para recuperação idempotente de falhas de captura
-- =============================================================================
create index ai_runs_capture_failed_idx on public.ai_runs (workspace_id, created_at desc)
  where operation = 'capture_triage' and status = 'failed';

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.push_subscriptions enable row level security;
alter table public.push_deliveries enable row level security;

-- Propositalmente SEM policy para "authenticated" em nenhuma das duas
-- tabelas (mesmo padrão de integration_tokens): o navegador nunca lê
-- endpoint/p256dh/auth nem o estado da outbox diretamente. Toda leitura e
-- escrita acontece em rotas server-side autenticadas, usando o cliente
-- admin (service_role bypassa RLS, mas GRANT e RLS são camadas
-- independentes — por isso os GRANTs abaixo continuam necessários).

-- =============================================================================
-- GRANTS — privilégio mínimo necessário
-- =============================================================================

-- push_subscriptions: gerenciado inteiramente pelo servidor (rotas
-- autenticadas + cron). Sem delete: desativação é update (disabled_at).
grant select, insert, update on public.push_subscriptions to service_role;

-- push_deliveries: outbox gerenciada pelo servidor (criação de entregas +
-- dispatcher do cron). Sem delete: falhas permanecem como histórico auditável.
grant select, insert, update on public.push_deliveries to service_role;

-- ai_runs: o cron (push-tick) precisa localizar execuções de triagem que
-- falharam e ainda não geraram notificação (recuperação idempotente).
grant select on public.ai_runs to service_role;

-- notifications: service_role já tinha apenas insert (cron horário
-- existente); o dispatcher de push precisa também ler (join de
-- push_deliveries → notifications) para montar o payload de envio.
grant select on public.notifications to service_role;

-- =============================================================================
-- Migration: aviso Web Push de fim de descanso nos Treinos (Lutheus + QStash)
-- =============================================================================
-- Fluxo (ver docs/TREINOS_AVISO_DESCANSO_PUSH.md):
--   1. O app grava o descanso na sessão (rest_ends_at) como já fazia.
--   2. Este banco carimba o descanso com uma GERAÇÃO (rest_nonce) gerada por
--      trigger — nunca pelo cliente. Qualquer mudança de prazo (reiniciar,
--      ±15 s, retomar) gera uma geração nova; pausar, pular, encerrar ou
--      cancelar a sessão zera a geração.
--   3. O servidor agenda no QStash um callback para (sessão, geração).
--   4. No horário, o callback só envia se a sessão AINDA estiver com a mesma
--      geração em andamento — callbacks de descansos antigos morrem sozinhos.
--   5. Cada dispositivo recebe no máximo um aviso por (sessão, geração):
--      garantido pela chave única de workout_rest_push_deliveries.
--
-- Destinatário: o usuário vinculado ao atleta (workout_athletes.user_id),
-- resolvido no servidor. Por isso este arquivo também protege user_id contra
-- alteração pelo navegador (só service_role / SQL administrativo vinculam).
--
-- Aditiva: nenhuma coluna ou tabela existente é removida ou reescrita.
-- =============================================================================

-- 1. Preferência por dispositivo (opt-in, igual às demais categorias) --------
alter table public.push_subscriptions
  add column if not exists workout_rest_enabled boolean not null default false;

-- 2. Geração do descanso ------------------------------------------------------
alter table public.workout_sessions
  add column if not exists rest_nonce uuid;

create or replace function public.workout_sessions_set_rest_nonce()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'in_progress'
     or new.rest_ends_at is null
     or new.rest_paused_remaining_seconds is not null then
    new.rest_nonce := null;
  elsif tg_op = 'INSERT'
     or old.rest_nonce is null
     or new.rest_ends_at is distinct from old.rest_ends_at then
    new.rest_nonce := gen_random_uuid();
  else
    -- Mesmo descanso (ex.: trocar de ficha A–E): preserva a geração e
    -- ignora qualquer valor enviado pelo cliente.
    new.rest_nonce := old.rest_nonce;
  end if;
  return new;
end;
$$;

drop trigger if exists workout_sessions_rest_nonce on public.workout_sessions;
create trigger workout_sessions_rest_nonce
  before insert or update on public.workout_sessions
  for each row execute function public.workout_sessions_set_rest_nonce();

-- 3. Vínculo atleta ↔ usuário (destinatário do aviso) ------------------------
-- Um usuário representa no máximo um atleta por workspace.
create unique index if not exists workout_athletes_user_unique_idx
  on public.workout_athletes (workspace_id, user_id)
  where user_id is not null;

-- O navegador (anon/authenticated) nunca altera user_id: só o servidor
-- (service_role) ou SQL administrativo. Upserts do app continuam funcionando —
-- o valor existente é preservado.
create or replace function public.workout_athletes_protect_user_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.user_id := null;
    else
      new.user_id := old.user_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists workout_athletes_protect_user_id on public.workout_athletes;
create trigger workout_athletes_protect_user_id
  before insert or update on public.workout_athletes
  for each row execute function public.workout_athletes_protect_user_id();

-- 4. Controle de envio por dispositivo ---------------------------------------
-- Uma linha por (sessão, geração, dispositivo). A chave única é o que impede
-- duplicidade sob retries do QStash e callbacks concorrentes: só quem insere
-- a linha envia. 'accepted' = o serviço de push ACEITOU a mensagem — não
-- significa que o iPhone exibiu a notificação.
create table if not exists public.workout_rest_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  rest_nonce uuid not null,
  subscription_id uuid not null references public.push_subscriptions (id) on delete cascade,
  rest_ends_at timestamptz not null,
  status text not null default 'claimed'
    check (status in ('claimed', 'accepted', 'failed')),
  error_category text
    check (error_category in ('expired_subscription', 'rate_limited', 'payload_too_large', 'network_error', 'server_error', 'unknown_error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, rest_nonce, subscription_id)
);

create index if not exists workout_rest_push_deliveries_subscription_idx
  on public.workout_rest_push_deliveries (subscription_id);

drop trigger if exists workout_rest_push_deliveries_updated_at on public.workout_rest_push_deliveries;
create trigger workout_rest_push_deliveries_updated_at
  before update on public.workout_rest_push_deliveries
  for each row execute function public.set_updated_at();

-- Sem policy para "authenticated" (mesmo padrão de push_deliveries): só o
-- servidor lê/escreve.
alter table public.workout_rest_push_deliveries enable row level security;
grant select, insert, update on public.workout_rest_push_deliveries to service_role;

-- 5. Leituras do callback (cliente admin, server-only) ------------------------
-- O callback do QStash não tem usuário logado: resolve sessão → atleta →
-- usuário → membership com o service_role. Só leitura.
grant select on public.workout_sessions to service_role;
grant select on public.workout_athletes to service_role;
grant select on public.workspace_members to service_role;

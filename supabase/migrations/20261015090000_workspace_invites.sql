-- =============================================================================
-- Migration: convite seguro para compartilhar o workspace doméstico
-- =============================================================================
-- Objetivo: Lucas e Matheus entram (cada um com a própria conta Google) no
-- MESMO workspace, com os mesmos dados de compras, finanças e notas.
--
-- Garantias de segurança:
--  - O convite é amarrado ao e-mail do convidado e só vale para uma conta com
--    esse e-mail CONFIRMADO. Outras contas não conseguem aceitá-lo.
--  - O token é aleatório (2 UUIDs v4), de uso único, expira em 7 dias e só o
--    HASH (sha256) fica no banco; o token em claro existe apenas na resposta
--    de create_workspace_invite().
--  - Só um owner do workspace cria ou revoga convites.
--  - Máximo de 2 pessoas por workspace.
--  - A tabela de convites tem RLS ligada, SEM policies e SEM grants: todo
--    acesso passa pelas funções SECURITY DEFINER abaixo.
--  - As RLS existentes (is_workspace_member) não mudam: o convidado passa a
--    ter acesso a ESTE workspace e a nenhum outro. Workspaces de terceiros
--    (por exemplo, o de um amigo que só conheceu o painel) não são tocados.
--  - Nenhum dado existente é alterado ou apagado.
--
-- Workspace padrão por usuário: hoje o app escolhe o membership mais antigo.
-- Quem aceita um convite já tem um workspace pessoal (criado no primeiro
-- login), então precisa de um "workspace padrão" explícito. A coluna é
-- nullable: para quem não tem valor, nada muda (continua o mais antigo).
-- =============================================================================

alter table public.profiles
  add column if not exists default_workspace_id uuid
  references public.workspaces (id) on delete set null;

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  token_hash text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null
);

create index workspace_invites_workspace_idx on public.workspace_invites (workspace_id);

alter table public.workspace_invites enable row level security;
revoke all on public.workspace_invites from anon, authenticated;

-- ---------------------------------------------------------------------------
-- ensure_personal_workspace(): respeita o workspace padrão (se o usuário
-- ainda for membro dele); senão mantém o comportamento anterior.
-- ---------------------------------------------------------------------------
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

  select p.default_workspace_id into ws_id
  from public.profiles p
  where p.id = uid
    and p.default_workspace_id is not null
    and exists (
      select 1 from public.workspace_members m
      where m.workspace_id = p.default_workspace_id and m.user_id = uid
    );

  if ws_id is not null then
    return ws_id;
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

-- ---------------------------------------------------------------------------
-- Criar convite (só owner). Devolve o token em claro UMA vez.
-- ---------------------------------------------------------------------------
create or replace function public.create_workspace_invite(p_workspace_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token text;
begin
  if uid is null then
    raise exception 'Não autenticado';
  end if;
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.user_id = uid and m.role = 'owner'
  ) then
    raise exception 'Apenas quem administra o workspace pode convidar.';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-mail inválido.';
  end if;
  if (select count(*) from public.workspace_members m where m.workspace_id = p_workspace_id) >= 2 then
    raise exception 'Este workspace já tem o máximo de 2 pessoas.';
  end if;

  -- Um convite pendente por e-mail: o anterior deixa de valer.
  delete from public.workspace_invites
  where workspace_id = p_workspace_id and email = v_email and accepted_at is null;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.workspace_invites (workspace_id, email, token_hash, created_by, expires_at)
  values (p_workspace_id, v_email, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), uid, now() + interval '7 days');

  return v_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- Aceitar convite: conta autenticada com o e-mail convidado (confirmado).
-- A mensagem de erro é a mesma para token inexistente, expirado, já usado ou
-- de outro e-mail: não revela qual caso ocorreu.
-- ---------------------------------------------------------------------------
create or replace function public.accept_workspace_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  v_email text;
  inv public.workspace_invites%rowtype;
begin
  if uid is null then
    raise exception 'Não autenticado';
  end if;

  select lower(btrim(u.email)) into v_email
  from auth.users u
  where u.id = uid and u.email_confirmed_at is not null;

  select * into inv
  from public.workspace_invites i
  where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and i.accepted_at is null
    and i.expires_at > now()
  for update;

  if not found or v_email is null or inv.email <> v_email then
    raise exception 'Convite inválido ou expirado.';
  end if;

  if not exists (
    select 1 from public.workspace_members m where m.workspace_id = inv.workspace_id and m.user_id = uid
  ) then
    if (select count(*) from public.workspace_members m where m.workspace_id = inv.workspace_id) >= 2 then
      raise exception 'Este workspace já tem o máximo de 2 pessoas.';
    end if;
    insert into public.workspace_members (workspace_id, user_id, role)
    values (inv.workspace_id, uid, 'member');
  end if;

  update public.workspace_invites
  set accepted_at = now(), accepted_by = uid
  where id = inv.id;

  update public.profiles set default_workspace_id = inv.workspace_id where id = uid;

  return inv.workspace_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Listagens e revogação (sem expor token nem hash).
-- ---------------------------------------------------------------------------
create or replace function public.list_workspace_members(p_workspace_id uuid)
returns table (user_id uuid, email text, role text)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Sem acesso a este workspace.';
  end if;
  return query
    select m.user_id, p.email, m.role
    from public.workspace_members m
    join public.profiles p on p.id = m.user_id
    where m.workspace_id = p_workspace_id
    order by m.created_at;
end;
$$;

create or replace function public.list_workspace_invites(p_workspace_id uuid)
returns table (id uuid, email text, expires_at timestamptz, accepted_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid()) and m.role = 'owner'
  ) then
    raise exception 'Apenas quem administra o workspace pode ver convites.';
  end if;
  return query
    select i.id, i.email, i.expires_at, i.accepted_at
    from public.workspace_invites i
    where i.workspace_id = p_workspace_id
    order by i.created_at desc;
end;
$$;

create or replace function public.revoke_workspace_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.workspace_invites i
  where i.id = p_invite_id
    and i.accepted_at is null
    and exists (
      select 1 from public.workspace_members m
      where m.workspace_id = i.workspace_id and m.user_id = (select auth.uid()) and m.role = 'owner'
    );
end;
$$;

-- Privilégio mínimo: só usuários autenticados executam; PUBLIC e anon não.
revoke execute on function public.create_workspace_invite(uuid, text) from public, anon;
revoke execute on function public.accept_workspace_invite(text) from public, anon;
revoke execute on function public.list_workspace_members(uuid) from public, anon;
revoke execute on function public.list_workspace_invites(uuid) from public, anon;
revoke execute on function public.revoke_workspace_invite(uuid) from public, anon;
grant execute on function public.create_workspace_invite(uuid, text) to authenticated;
grant execute on function public.accept_workspace_invite(text) to authenticated;
grant execute on function public.list_workspace_members(uuid) to authenticated;
grant execute on function public.list_workspace_invites(uuid) to authenticated;
grant execute on function public.revoke_workspace_invite(uuid) to authenticated;

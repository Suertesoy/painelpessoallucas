-- =============================================================================
-- Migration: Finanças — classificação de lançamentos e entradas fixas
-- =============================================================================
-- 100% ADITIVA sobre `20260815100000_finance_cash_core.sql` (já em produção).
-- Não altera valores, não apaga nem reescreve nenhuma linha existente:
--
--  1. `finance_invoice_items` ganha `category` e `purpose` (ambos NULL = ainda
--     não classificado). Classificar é só rotular: nenhuma coluna monetária
--     e nenhuma função de importação/conciliação lê ou escreve estas colunas,
--     então a classificação sobrevive a qualquer reimportação. A lista de
--     categorias vive no código (validada na aplicação); o banco só garante
--     o formato do identificador e o conjunto fechado de finalidades.
--
--  2. `finance_recurring_incomes` (entradas fixas mensais) e
--     `finance_recurring_income_occurrences` (SÓ exceções e confirmações: valor
--     de um mês, recebido, cancelado). Ocorrências futuras NÃO são gravadas:
--     a projeção as calcula de forma determinística a partir do modelo.
--
--  3. Funções SECURITY INVOKER, transacionais e idempotentes, para confirmar
--     e desfazer o recebimento de uma entrada fixa sem duplicar saldo.
--
-- RLS + GRANT na mesma migration. Sem DELETE para o usuário: encerrar é
-- definir o mês final (inclusivo) ou desativar.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Classificação dos lançamentos de fatura
-- ---------------------------------------------------------------------------
alter table public.finance_invoice_items
  add column category text check (category is null or category ~ '^[a-z_]{2,40}$');

alter table public.finance_invoice_items
  add column purpose text check (purpose is null or purpose in ('personal', 'household', 'professional'));

create index finance_invoice_items_classification_idx
  on public.finance_invoice_items (workspace_id, category, purpose);

-- ---------------------------------------------------------------------------
-- 2. Entradas fixas recorrentes
-- ---------------------------------------------------------------------------
create table public.finance_recurring_incomes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  description text not null check (char_length(description) between 1 and 200),
  amount_cents bigint not null check (amount_cents > 0),
  day_of_month integer not null check (day_of_month between 1 and 31),
  start_month text not null check (start_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  -- Inclusivo: a entrada ainda ocorre no mês final.
  end_month text check (end_month is null or end_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  notes text check (notes is null or char_length(notes) <= 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  check (end_month is null or end_month >= start_month)
);

create index finance_recurring_incomes_ws_idx on public.finance_recurring_incomes (workspace_id, active);

create trigger finance_recurring_incomes_updated_at
  before update on public.finance_recurring_incomes
  for each row execute function public.set_updated_at();

alter table public.finance_recurring_incomes enable row level security;
create policy "finance_recurring_incomes_select" on public.finance_recurring_incomes
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_recurring_incomes_insert" on public.finance_recurring_incomes
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "finance_recurring_incomes_update" on public.finance_recurring_incomes
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create table public.finance_recurring_income_occurrences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  income_id uuid not null,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  -- Valor só deste mês (null = usa o valor do modelo).
  amount_cents bigint check (amount_cents is null or amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'received', 'cancelled')),
  -- Quanto foi confirmado e se foi somado ao saldo (para desfazer com exatidão).
  received_cents bigint check (received_cents is null or received_cents > 0),
  added_to_balance boolean not null default false,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (income_id, month),
  foreign key (workspace_id, income_id) references public.finance_recurring_incomes (workspace_id, id) on delete restrict
);

create trigger finance_recurring_income_occurrences_updated_at
  before update on public.finance_recurring_income_occurrences
  for each row execute function public.set_updated_at();

alter table public.finance_recurring_income_occurrences enable row level security;
create policy "finance_recurring_income_occurrences_select" on public.finance_recurring_income_occurrences
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_recurring_income_occurrences_insert" on public.finance_recurring_income_occurrences
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "finance_recurring_income_occurrences_update" on public.finance_recurring_income_occurrences
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- 3. Funções transacionais
-- ---------------------------------------------------------------------------

-- Confirma o recebimento de uma ocorrência; opcionalmente soma ao saldo.
-- Idempotente: confirmar duas vezes não soma duas vezes.
create or replace function public.finance_mark_income_received(
  p_income_id uuid,
  p_month text,
  p_add_to_balance boolean
)
returns public.finance_recurring_income_occurrences
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_income public.finance_recurring_incomes;
  v_occ public.finance_recurring_income_occurrences;
  v_amount bigint;
begin
  select * into v_income from public.finance_recurring_incomes where id = p_income_id;
  if not found then
    raise exception 'Entrada fixa não encontrada' using errcode = 'P0002';
  end if;
  perform public.finance_assert_member(v_income.workspace_id);
  if p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Mês inválido' using errcode = '22023';
  end if;
  if p_month < v_income.start_month or (v_income.end_month is not null and p_month > v_income.end_month) then
    raise exception 'Mês fora do período da entrada' using errcode = '22023';
  end if;

  insert into public.finance_recurring_income_occurrences (workspace_id, income_id, month)
  values (v_income.workspace_id, p_income_id, p_month)
  on conflict (income_id, month) do nothing;

  select * into v_occ from public.finance_recurring_income_occurrences
    where income_id = p_income_id and month = p_month for update;

  if v_occ.status = 'received' then
    return v_occ;
  end if;

  v_amount := coalesce(v_occ.amount_cents, v_income.amount_cents);
  update public.finance_recurring_income_occurrences
    set status = 'received', received_cents = v_amount, received_at = now(),
        added_to_balance = coalesce(p_add_to_balance, false)
    where id = v_occ.id
    returning * into v_occ;

  if p_add_to_balance then
    insert into public.finance_balance (workspace_id) values (v_income.workspace_id)
    on conflict (workspace_id) do nothing;
    update public.finance_balance
      set available_cents = available_cents + v_amount, available_updated_at = now()
      where workspace_id = v_income.workspace_id;
  end if;
  return v_occ;
end;
$$;

-- Volta uma ocorrência a 'pending' ou a marca 'cancelled' (não vai receber).
-- Se estava recebida E foi somada ao saldo, opcionalmente remove do saldo o
-- mesmo valor confirmado (nunca mais, nunca menos) — e SOMENTE se o saldo não
-- mudou desde a confirmação; senão recusa com BALANCE_CHANGED_SINCE.
create or replace function public.finance_reset_income_occurrence(
  p_income_id uuid,
  p_month text,
  p_new_status text,
  p_remove_from_balance boolean
)
returns public.finance_recurring_income_occurrences
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_income public.finance_recurring_incomes;
  v_occ public.finance_recurring_income_occurrences;
  v_balance public.finance_balance;
begin
  if p_new_status not in ('pending', 'cancelled') then
    raise exception 'Status inválido' using errcode = '22023';
  end if;
  select * into v_income from public.finance_recurring_incomes where id = p_income_id;
  if not found then
    raise exception 'Entrada fixa não encontrada' using errcode = 'P0002';
  end if;
  perform public.finance_assert_member(v_income.workspace_id);
  if p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Mês inválido' using errcode = '22023';
  end if;

  insert into public.finance_recurring_income_occurrences (workspace_id, income_id, month)
  values (v_income.workspace_id, p_income_id, p_month)
  on conflict (income_id, month) do nothing;

  select * into v_occ from public.finance_recurring_income_occurrences
    where income_id = p_income_id and month = p_month for update;

  if v_occ.status = 'received' and v_occ.added_to_balance and p_remove_from_balance then
    -- Só reverte automaticamente se NADA mexeu no saldo depois da confirmação
    -- (a confirmação grava received_at e available_updated_at na mesma
    -- transação, logo iguais). Se o saldo foi atualizado à mão ou por outra
    -- operação depois, subtrair produziria um saldo incorreto: recusa, e o
    -- usuário ajusta o saldo manualmente.
    select * into v_balance from public.finance_balance
      where workspace_id = v_income.workspace_id for update;
    if not found or v_balance.available_updated_at is null or v_balance.available_updated_at > v_occ.received_at then
      raise exception 'BALANCE_CHANGED_SINCE' using errcode = 'P0001';
    end if;
    update public.finance_balance
      set available_cents = available_cents - v_occ.received_cents, available_updated_at = now()
      where workspace_id = v_income.workspace_id;
  end if;

  update public.finance_recurring_income_occurrences
    set status = p_new_status, received_cents = null, received_at = null, added_to_balance = false
    where id = v_occ.id
    returning * into v_occ;
  return v_occ;
end;
$$;

revoke execute on function public.finance_mark_income_received(uuid, text, boolean) from public, anon;
revoke execute on function public.finance_reset_income_occurrence(uuid, text, text, boolean) from public, anon;
grant execute on function public.finance_mark_income_received(uuid, text, boolean) to authenticated;
grant execute on function public.finance_reset_income_occurrence(uuid, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- GRANTS (anon: nada; sem DELETE)
-- ---------------------------------------------------------------------------
grant select, insert, update on public.finance_recurring_incomes to authenticated;
grant select, insert, update on public.finance_recurring_income_occurrences to authenticated;
grant select on public.finance_recurring_incomes to service_role;
grant select on public.finance_recurring_income_occurrences to service_role;

-- ---------------------------------------------------------------------------
-- REALTIME
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['finance_recurring_incomes', 'finance_recurring_income_occurrences'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- =============================================================================
-- Migration: Finanças — caixa da casa (saldo, reserva, recebimentos,
-- compromissos, faturas de cartão e itens importados)
-- =============================================================================
-- 100% ADITIVA. Não altera nem apaga nenhuma tabela, coluna ou linha
-- existente (as tabelas legadas `finance_*` do módulo anterior seguem
-- intactas e sem uso pela nova interface).
--
-- Convenções:
--  * Dinheiro sempre em centavos inteiros (bigint).
--  * Mês como texto 'YYYY-MM' (mês de VENCIMENTO, no caso de faturas).
--  * RLS por workspace (is_workspace_member) + GRANT na mesma migration.
--  * Integridade entre workspaces por chave estrangeira composta.
--  * Sem DELETE para o usuário: cancelar/remover é mudança de status.
--  * Funções SECURITY INVOKER (RLS continua valendo) com search_path fixo e
--    verificação explícita de pertencimento ao workspace.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Saldo disponível + reserva (1 linha por workspace)
-- ---------------------------------------------------------------------------
create table public.finance_balance (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  available_cents bigint not null default 0,
  reserve_cents bigint not null default 0 check (reserve_cents >= 0),
  available_updated_at timestamptz,
  reserve_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id)
);

create trigger finance_balance_updated_at
  before update on public.finance_balance
  for each row execute function public.set_updated_at();

alter table public.finance_balance enable row level security;
create policy "finance_balance_select" on public.finance_balance
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_balance_insert" on public.finance_balance
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "finance_balance_update" on public.finance_balance
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- Transferências internas reserva <-> disponível (não são receita nem despesa)
-- ---------------------------------------------------------------------------
create table public.finance_balance_transfers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  direction text not null check (direction in ('reserve_to_available', 'available_to_reserve')),
  amount_cents bigint not null check (amount_cents > 0),
  note text,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, request_id)
);

create index finance_balance_transfers_ws_idx on public.finance_balance_transfers (workspace_id, created_at desc);

alter table public.finance_balance_transfers enable row level security;
create policy "finance_balance_transfers_select" on public.finance_balance_transfers
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_balance_transfers_insert" on public.finance_balance_transfers
  for insert to authenticated with check (public.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- Recebimentos
-- ---------------------------------------------------------------------------
create table public.finance_receivables (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  description text not null check (char_length(description) between 1 and 200),
  amount_cents bigint not null check (amount_cents > 0),
  expected_date date not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'uncertain', 'received', 'cancelled')),
  notes text check (notes is null or char_length(notes) <= 1000),
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create index finance_receivables_ws_idx on public.finance_receivables (workspace_id, expected_date);

create trigger finance_receivables_updated_at
  before update on public.finance_receivables
  for each row execute function public.set_updated_at();

alter table public.finance_receivables enable row level security;
create policy "finance_receivables_select" on public.finance_receivables
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_receivables_insert" on public.finance_receivables
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "finance_receivables_update" on public.finance_receivables
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- Compromissos (avulsos ou recorrentes; cobrança direta ou no cartão)
-- ---------------------------------------------------------------------------
create table public.finance_commitments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  description text not null check (char_length(description) between 1 and 200),
  amount_cents bigint not null check (amount_cents > 0),
  recurrence text not null check (recurrence in ('none', 'monthly')),
  due_date date,
  day_of_month integer check (day_of_month between 1 and 31),
  start_month text not null check (start_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  end_month text check (end_month is null or end_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  billing text not null default 'direct' check (billing in ('direct', 'card')),
  card text check (card in ('nubank_1', 'nubank_2')),
  category text check (category is null or char_length(category) <= 60),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  check ((recurrence = 'none' and due_date is not null) or (recurrence = 'monthly' and day_of_month is not null)),
  check ((billing = 'card' and card is not null) or (billing = 'direct' and card is null))
);

create index finance_commitments_ws_idx on public.finance_commitments (workspace_id, active);

create trigger finance_commitments_updated_at
  before update on public.finance_commitments
  for each row execute function public.set_updated_at();

alter table public.finance_commitments enable row level security;
create policy "finance_commitments_select" on public.finance_commitments
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_commitments_insert" on public.finance_commitments
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "finance_commitments_update" on public.finance_commitments
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Exceções por mês: valor editado, pago, "já incluído na fatura", ignorado.
create table public.finance_commitment_occurrences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  commitment_id uuid not null,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount_cents bigint check (amount_cents is null or amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'included_in_invoice', 'skipped')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (commitment_id, month),
  foreign key (workspace_id, commitment_id) references public.finance_commitments (workspace_id, id) on delete restrict
);

create trigger finance_commitment_occurrences_updated_at
  before update on public.finance_commitment_occurrences
  for each row execute function public.set_updated_at();

alter table public.finance_commitment_occurrences enable row level security;
create policy "finance_commitment_occurrences_select" on public.finance_commitment_occurrences
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_commitment_occurrences_insert" on public.finance_commitment_occurrences
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "finance_commitment_occurrences_update" on public.finance_commitment_occurrences
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- Faturas de cartão (por cartão + mês de vencimento)
-- ---------------------------------------------------------------------------
create table public.finance_card_invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  card text not null check (card in ('nubank_1', 'nubank_2')),
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status text not null default 'open' check (status in ('open', 'closed', 'paid')),
  manual_amount_cents bigint check (manual_amount_cents is null or manual_amount_cents >= 0),
  -- Derivado dos itens (compras + estornos/ajustes, sem pagamentos); null se
  -- nunca houve importação.
  imported_amount_cents bigint,
  due_date date,
  paid_at timestamptz,
  last_imported_at timestamptz,
  -- Contador de revisão: a importação só aplica um plano calculado sobre a
  -- revisão atual (protege contra decisões obsoletas / duas abas).
  rev integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, card, month),
  unique (workspace_id, id)
);

create trigger finance_card_invoices_updated_at
  before update on public.finance_card_invoices
  for each row execute function public.set_updated_at();

alter table public.finance_card_invoices enable row level security;
create policy "finance_card_invoices_select" on public.finance_card_invoices
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_card_invoices_insert" on public.finance_card_invoices
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "finance_card_invoices_update" on public.finance_card_invoices
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Histórico de importações (o arquivo bruto NUNCA é guardado, nem o nome
-- original além do que o usuário já conhece).
create table public.finance_invoice_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  invoice_id uuid not null,
  request_id uuid not null,
  file_name text not null,
  file_sha256 text not null,
  row_count integer not null default 0,
  recognized_count integer not null default 0,
  new_count integer not null default 0,
  changed_count integer not null default 0,
  missing_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (workspace_id, request_id),
  unique (workspace_id, id),
  foreign key (workspace_id, invoice_id) references public.finance_card_invoices (workspace_id, id) on delete restrict
);

create index finance_invoice_imports_inv_idx on public.finance_invoice_imports (workspace_id, invoice_id, created_at desc);

alter table public.finance_invoice_imports enable row level security;
create policy "finance_invoice_imports_select" on public.finance_invoice_imports
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_invoice_imports_insert" on public.finance_invoice_imports
  for insert to authenticated with check (public.is_workspace_member(workspace_id));

create table public.finance_invoice_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  invoice_id uuid not null,
  first_import_id uuid not null,
  last_import_id uuid not null,
  purchase_date date not null,
  description text not null,
  normalized_description text not null,
  -- Sinal do arquivo: positivo = cobrança; negativo = crédito.
  amount_cents bigint not null check (amount_cents <> 0),
  kind text not null check (kind in ('purchase', 'refund', 'payment', 'adjustment')),
  occurrence_index integer not null default 0 check (occurrence_index >= 0),
  installment_no integer,
  installment_total integer,
  base_description text not null,
  status text not null default 'active' check (status in ('active', 'missing', 'removed')),
  commitment_id uuid,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, invoice_id, purchase_date, normalized_description, amount_cents, occurrence_index),
  foreign key (workspace_id, invoice_id) references public.finance_card_invoices (workspace_id, id) on delete restrict,
  foreign key (workspace_id, first_import_id) references public.finance_invoice_imports (workspace_id, id) on delete restrict,
  foreign key (workspace_id, last_import_id) references public.finance_invoice_imports (workspace_id, id) on delete restrict,
  foreign key (workspace_id, commitment_id) references public.finance_commitments (workspace_id, id) on delete restrict
);

create index finance_invoice_items_inv_idx on public.finance_invoice_items (workspace_id, invoice_id);
create index finance_invoice_items_commitment_idx on public.finance_invoice_items (workspace_id, commitment_id)
  where commitment_id is not null;

create trigger finance_invoice_items_updated_at
  before update on public.finance_invoice_items
  for each row execute function public.set_updated_at();

alter table public.finance_invoice_items enable row level security;
create policy "finance_invoice_items_select" on public.finance_invoice_items
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_invoice_items_insert" on public.finance_invoice_items
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "finance_invoice_items_update" on public.finance_invoice_items
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- =============================================================================
-- FUNÇÕES TRANSACIONAIS
-- =============================================================================

create or replace function public.finance_assert_member(p_workspace_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_workspace_id is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'Sem permissão neste workspace' using errcode = '42501';
  end if;
end;
$$;

-- Transferência reserva <-> disponível, atômica e idempotente por request_id.
create or replace function public.finance_transfer_reserve(
  p_workspace_id uuid,
  p_direction text,
  p_amount_cents bigint,
  p_note text,
  p_request_id uuid
)
returns public.finance_balance
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_balance public.finance_balance;
begin
  perform public.finance_assert_member(p_workspace_id);
  if p_direction not in ('reserve_to_available', 'available_to_reserve') then
    raise exception 'Direção inválida' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Valor deve ser positivo' using errcode = '22023';
  end if;

  insert into public.finance_balance (workspace_id) values (p_workspace_id)
  on conflict (workspace_id) do nothing;

  select * into v_balance from public.finance_balance where workspace_id = p_workspace_id for update;

  if exists (select 1 from public.finance_balance_transfers where workspace_id = p_workspace_id and request_id = p_request_id) then
    return v_balance;
  end if;

  if p_direction = 'reserve_to_available' then
    if v_balance.reserve_cents < p_amount_cents then
      raise exception 'RESERVE_INSUFFICIENT' using errcode = 'P0001';
    end if;
    update public.finance_balance
      set reserve_cents = reserve_cents - p_amount_cents,
          available_cents = available_cents + p_amount_cents,
          reserve_updated_at = now(), available_updated_at = now()
      where workspace_id = p_workspace_id
      returning * into v_balance;
  else
    update public.finance_balance
      set reserve_cents = reserve_cents + p_amount_cents,
          available_cents = available_cents - p_amount_cents,
          reserve_updated_at = now(), available_updated_at = now()
      where workspace_id = p_workspace_id
      returning * into v_balance;
  end if;

  insert into public.finance_balance_transfers (workspace_id, direction, amount_cents, note, request_id)
  values (p_workspace_id, p_direction, p_amount_cents, nullif(btrim(coalesce(p_note, '')), ''), p_request_id);

  return v_balance;
end;
$$;

-- Ajuste manual do saldo/reserva (a "foto"). Parâmetro null = não altera.
create or replace function public.finance_set_balance(
  p_workspace_id uuid,
  p_available_cents bigint,
  p_reserve_cents bigint
)
returns public.finance_balance
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_balance public.finance_balance;
begin
  perform public.finance_assert_member(p_workspace_id);
  if p_reserve_cents is not null and p_reserve_cents < 0 then
    raise exception 'A reserva não pode ser negativa' using errcode = '22023';
  end if;

  insert into public.finance_balance (workspace_id) values (p_workspace_id)
  on conflict (workspace_id) do nothing;

  update public.finance_balance
    set available_cents = coalesce(p_available_cents, available_cents),
        available_updated_at = case when p_available_cents is null then available_updated_at else now() end,
        reserve_cents = coalesce(p_reserve_cents, reserve_cents),
        reserve_updated_at = case when p_reserve_cents is null then reserve_updated_at else now() end
    where workspace_id = p_workspace_id
    returning * into v_balance;
  return v_balance;
end;
$$;

-- Recebimento recebido; opcionalmente soma ao saldo (idempotente: só age uma vez).
create or replace function public.finance_mark_receivable_received(
  p_receivable_id uuid,
  p_add_to_balance boolean
)
returns public.finance_receivables
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.finance_receivables;
begin
  select * into v_row from public.finance_receivables where id = p_receivable_id for update;
  if not found then
    raise exception 'Recebimento não encontrado' using errcode = 'P0002';
  end if;
  perform public.finance_assert_member(v_row.workspace_id);
  if v_row.status in ('received', 'cancelled') then
    return v_row;
  end if;

  update public.finance_receivables
    set status = 'received', received_at = now()
    where id = p_receivable_id
    returning * into v_row;

  if p_add_to_balance then
    insert into public.finance_balance (workspace_id) values (v_row.workspace_id)
    on conflict (workspace_id) do nothing;
    update public.finance_balance
      set available_cents = available_cents + v_row.amount_cents, available_updated_at = now()
      where workspace_id = v_row.workspace_id;
  end if;
  return v_row;
end;
$$;

-- Conta paga em um mês; opcionalmente abate do saldo (idempotente).
create or replace function public.finance_mark_commitment_paid(
  p_commitment_id uuid,
  p_month text,
  p_deduct_from_balance boolean
)
returns public.finance_commitment_occurrences
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_commitment public.finance_commitments;
  v_occ public.finance_commitment_occurrences;
  v_amount bigint;
begin
  select * into v_commitment from public.finance_commitments where id = p_commitment_id;
  if not found then
    raise exception 'Compromisso não encontrado' using errcode = 'P0002';
  end if;
  perform public.finance_assert_member(v_commitment.workspace_id);
  if p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Mês inválido' using errcode = '22023';
  end if;

  insert into public.finance_commitment_occurrences (workspace_id, commitment_id, month)
  values (v_commitment.workspace_id, p_commitment_id, p_month)
  on conflict (commitment_id, month) do nothing;

  select * into v_occ from public.finance_commitment_occurrences
    where commitment_id = p_commitment_id and month = p_month for update;

  if v_occ.status = 'paid' then
    return v_occ;
  end if;

  v_amount := coalesce(v_occ.amount_cents, v_commitment.amount_cents);
  update public.finance_commitment_occurrences
    set status = 'paid', paid_at = now()
    where id = v_occ.id
    returning * into v_occ;

  if p_deduct_from_balance then
    insert into public.finance_balance (workspace_id) values (v_commitment.workspace_id)
    on conflict (workspace_id) do nothing;
    update public.finance_balance
      set available_cents = available_cents - v_amount, available_updated_at = now()
      where workspace_id = v_commitment.workspace_id;
  end if;
  return v_occ;
end;
$$;

-- Fatura paga; opcionalmente abate o valor efetivo do saldo (idempotente).
create or replace function public.finance_mark_invoice_paid(
  p_invoice_id uuid,
  p_deduct_from_balance boolean
)
returns public.finance_card_invoices
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inv public.finance_card_invoices;
  v_amount bigint;
begin
  select * into v_inv from public.finance_card_invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Fatura não encontrada' using errcode = 'P0002';
  end if;
  perform public.finance_assert_member(v_inv.workspace_id);
  if v_inv.status = 'paid' then
    return v_inv;
  end if;

  v_amount := coalesce(v_inv.imported_amount_cents, v_inv.manual_amount_cents, 0);
  update public.finance_card_invoices
    set status = 'paid', paid_at = now()
    where id = p_invoice_id
    returning * into v_inv;

  if p_deduct_from_balance and v_amount > 0 then
    insert into public.finance_balance (workspace_id) values (v_inv.workspace_id)
    on conflict (workspace_id) do nothing;
    update public.finance_balance
      set available_cents = available_cents - v_amount, available_updated_at = now()
      where workspace_id = v_inv.workspace_id;
  end if;
  return v_inv;
end;
$$;

-- Aplicação transacional e idempotente de uma importação de fatura.
-- O plano (jsonb) é calculado no servidor após reconciliação; esta função só
-- o aplica de forma atômica, travando a fatura e conferindo a revisão.
--
-- p_plan:
--   insert:     [{purchase_date, description, normalized_description,
--                 amount_cents, kind, occurrence_index, installment_no,
--                 installment_total, base_description, commitment_id}]
--   recognize:  [item_id]                         (reativa/atualiza last_import)
--   update:     [{id, purchase_date, amount_cents}] (divergência = mesmo item)
--   missing:    [item_id]                          (ausente do arquivo)
--   remove:     [item_id]                          (remoção confirmada)
--   link:       [{item_id, commitment_id}]         (vínculos confirmados)
--   pay_invoice_ids: [invoice_id]                  (pagamentos reconhecidos)
--   counts:     {rows, recognized, new, changed, missing}
create or replace function public.finance_apply_invoice_import(
  p_workspace_id uuid,
  p_card text,
  p_month text,
  p_due_date date,
  p_new_status text,
  p_request_id uuid,
  p_expected_rev integer,
  p_file_name text,
  p_file_sha256 text,
  p_plan jsonb
)
returns table (out_invoice_id uuid, out_already_applied boolean, out_rev integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inv public.finance_card_invoices;
  v_import_id uuid;
  v_existing_invoice_id uuid;
  v_counts jsonb := coalesce(p_plan -> 'counts', '{}'::jsonb);
begin
  perform public.finance_assert_member(p_workspace_id);
  if p_card not in ('nubank_1', 'nubank_2') then
    raise exception 'Cartão inválido' using errcode = '22023';
  end if;
  if p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Mês inválido' using errcode = '22023';
  end if;
  if p_new_status is not null and p_new_status not in ('open', 'closed') then
    raise exception 'Status inválido' using errcode = '22023';
  end if;

  -- Reenvio da mesma requisição: devolve o resultado já aplicado.
  select i.invoice_id into v_existing_invoice_id from public.finance_invoice_imports i
    where i.workspace_id = p_workspace_id and i.request_id = p_request_id;
  if found then
    select * into v_inv from public.finance_card_invoices where id = v_existing_invoice_id;
    return query select v_inv.id, true, v_inv.rev;
    return;
  end if;

  insert into public.finance_card_invoices (workspace_id, card, month, due_date)
  values (p_workspace_id, p_card, p_month, p_due_date)
  on conflict (workspace_id, card, month) do nothing;

  select * into v_inv from public.finance_card_invoices
    where workspace_id = p_workspace_id and card = p_card and month = p_month for update;

  if v_inv.rev <> p_expected_rev then
    raise exception 'STALE_INVOICE' using errcode = 'P0001';
  end if;

  insert into public.finance_invoice_imports (
    workspace_id, invoice_id, request_id, file_name, file_sha256, row_count,
    recognized_count, new_count, changed_count, missing_count
  ) values (
    p_workspace_id, v_inv.id, p_request_id, left(p_file_name, 200), p_file_sha256,
    coalesce((v_counts ->> 'rows')::integer, 0),
    coalesce((v_counts ->> 'recognized')::integer, 0),
    coalesce((v_counts ->> 'new')::integer, 0),
    coalesce((v_counts ->> 'changed')::integer, 0),
    coalesce((v_counts ->> 'missing')::integer, 0)
  ) returning id into v_import_id;

  -- Itens reconhecidos: voltam a ativos e marcam a última importação.
  update public.finance_invoice_items
    set status = 'active', last_import_id = v_import_id, review_note = null
    where workspace_id = p_workspace_id and invoice_id = v_inv.id
      and id in (select (jsonb_array_elements_text(coalesce(p_plan -> 'recognize', '[]'::jsonb)))::uuid);

  -- Divergências resolvidas como "mesmo lançamento": atualiza data/valor.
  update public.finance_invoice_items it
    set purchase_date = u.purchase_date, amount_cents = u.amount_cents,
        status = 'active', last_import_id = v_import_id, review_note = null
    from jsonb_to_recordset(coalesce(p_plan -> 'update', '[]'::jsonb))
      as u(id uuid, purchase_date date, amount_cents bigint)
    where it.id = u.id and it.workspace_id = p_workspace_id and it.invoice_id = v_inv.id;

  insert into public.finance_invoice_items (
    workspace_id, invoice_id, first_import_id, last_import_id, purchase_date, description,
    normalized_description, amount_cents, kind, occurrence_index, installment_no,
    installment_total, base_description, commitment_id
  )
  select p_workspace_id, v_inv.id, v_import_id, v_import_id, n.purchase_date, n.description,
         n.normalized_description, n.amount_cents, n.kind, n.occurrence_index, n.installment_no,
         n.installment_total, n.base_description, n.commitment_id
  from jsonb_to_recordset(coalesce(p_plan -> 'insert', '[]'::jsonb)) as n(
    purchase_date date, description text, normalized_description text, amount_cents bigint,
    kind text, occurrence_index integer, installment_no integer, installment_total integer,
    base_description text, commitment_id uuid
  );

  update public.finance_invoice_items
    set status = 'missing', review_note = 'Ausente da última importação'
    where workspace_id = p_workspace_id and invoice_id = v_inv.id
      and id in (select (jsonb_array_elements_text(coalesce(p_plan -> 'missing', '[]'::jsonb)))::uuid);

  update public.finance_invoice_items
    set status = 'removed', review_note = 'Removido na conciliação'
    where workspace_id = p_workspace_id and invoice_id = v_inv.id
      and id in (select (jsonb_array_elements_text(coalesce(p_plan -> 'remove', '[]'::jsonb)))::uuid);

  update public.finance_invoice_items it
    set commitment_id = l.commitment_id
    from jsonb_to_recordset(coalesce(p_plan -> 'link', '[]'::jsonb)) as l(item_id uuid, commitment_id uuid)
    where it.id = l.item_id and it.workspace_id = p_workspace_id and it.invoice_id = v_inv.id;

  -- Faturas anteriores quitadas pelo "Pagamento recebido" do arquivo (sem
  -- mexer no saldo: o pagamento já aconteceu fora do app).
  update public.finance_card_invoices
    set status = 'paid', paid_at = coalesce(paid_at, now())
    where workspace_id = p_workspace_id and card = p_card and status <> 'paid'
      and id in (select (jsonb_array_elements_text(coalesce(p_plan -> 'pay_invoice_ids', '[]'::jsonb)))::uuid);

  update public.finance_card_invoices
    set imported_amount_cents = (
          select sum(amount_cents) from public.finance_invoice_items
          where workspace_id = p_workspace_id and invoice_id = v_inv.id
            and status in ('active', 'missing') and kind <> 'payment'
        ),
        due_date = coalesce(p_due_date, due_date),
        status = case
          when status = 'paid' then status
          else coalesce(p_new_status, status)
        end,
        last_imported_at = now(),
        rev = rev + 1
    where id = v_inv.id
    returning * into v_inv;

  return query select v_inv.id, false, v_inv.rev;
end;
$$;

-- Revisão de um lançamento ausente do último CSV: manter (volta a ativo) ou
-- remover (sai da fatura). Recalcula o valor importado na mesma transação.
create or replace function public.finance_resolve_missing_item(
  p_item_id uuid,
  p_action text
)
returns public.finance_card_invoices
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.finance_invoice_items;
  v_inv public.finance_card_invoices;
begin
  if p_action not in ('keep', 'remove') then
    raise exception 'Ação inválida' using errcode = '22023';
  end if;
  select * into v_item from public.finance_invoice_items where id = p_item_id;
  if not found then
    raise exception 'Lançamento não encontrado' using errcode = 'P0002';
  end if;
  perform public.finance_assert_member(v_item.workspace_id);

  select * into v_inv from public.finance_card_invoices where id = v_item.invoice_id for update;
  if v_inv.status = 'paid' then
    raise exception 'INVOICE_PAID' using errcode = 'P0001';
  end if;
  if v_item.status <> 'missing' then
    return v_inv;
  end if;

  update public.finance_invoice_items
    set status = case when p_action = 'keep' then 'active' else 'removed' end,
        review_note = case when p_action = 'keep' then 'Mantido após revisão' else 'Removido após revisão' end
    where id = p_item_id;

  update public.finance_card_invoices
    set imported_amount_cents = (
          select sum(amount_cents) from public.finance_invoice_items
          where workspace_id = v_inv.workspace_id and invoice_id = v_inv.id
            and status in ('active', 'missing') and kind <> 'payment'
        ),
        rev = rev + 1
    where id = v_inv.id
    returning * into v_inv;
  return v_inv;
end;
$$;

-- Funções criadas com EXECUTE para PUBLIC: revogar de public/anon e conceder
-- só a authenticated (mesma lição de 20260722150000_workspace_function_grants).
revoke execute on function public.finance_assert_member(uuid) from public, anon;
revoke execute on function public.finance_resolve_missing_item(uuid, text) from public, anon;
revoke execute on function public.finance_transfer_reserve(uuid, text, bigint, text, uuid) from public, anon;
revoke execute on function public.finance_set_balance(uuid, bigint, bigint) from public, anon;
revoke execute on function public.finance_mark_receivable_received(uuid, boolean) from public, anon;
revoke execute on function public.finance_mark_commitment_paid(uuid, text, boolean) from public, anon;
revoke execute on function public.finance_mark_invoice_paid(uuid, boolean) from public, anon;
revoke execute on function public.finance_apply_invoice_import(uuid, text, text, date, text, uuid, integer, text, text, jsonb) from public, anon;
grant execute on function public.finance_assert_member(uuid) to authenticated;
grant execute on function public.finance_resolve_missing_item(uuid, text) to authenticated;
grant execute on function public.finance_transfer_reserve(uuid, text, bigint, text, uuid) to authenticated;
grant execute on function public.finance_set_balance(uuid, bigint, bigint) to authenticated;
grant execute on function public.finance_mark_receivable_received(uuid, boolean) to authenticated;
grant execute on function public.finance_mark_commitment_paid(uuid, text, boolean) to authenticated;
grant execute on function public.finance_mark_invoice_paid(uuid, boolean) to authenticated;
grant execute on function public.finance_apply_invoice_import(uuid, text, text, date, text, uuid, integer, text, text, jsonb) to authenticated;

-- =============================================================================
-- GRANTS (exatamente as operações cobertas pelas policies). anon: nada.
-- =============================================================================
grant select, insert, update on public.finance_balance to authenticated;
grant select, insert on public.finance_balance_transfers to authenticated;
grant select, insert, update on public.finance_receivables to authenticated;
grant select, insert, update on public.finance_commitments to authenticated;
grant select, insert, update on public.finance_commitment_occurrences to authenticated;
grant select, insert, update on public.finance_card_invoices to authenticated;
grant select, insert on public.finance_invoice_imports to authenticated;
grant select, insert, update on public.finance_invoice_items to authenticated;

grant select on public.finance_balance to service_role;
grant select on public.finance_balance_transfers to service_role;
grant select on public.finance_receivables to service_role;
grant select on public.finance_commitments to service_role;
grant select on public.finance_commitment_occurrences to service_role;
grant select on public.finance_card_invoices to service_role;
grant select on public.finance_invoice_imports to service_role;
grant select on public.finance_invoice_items to service_role;

-- =============================================================================
-- REALTIME
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'finance_balance', 'finance_balance_transfers', 'finance_receivables', 'finance_commitments',
    'finance_commitment_occurrences', 'finance_card_invoices', 'finance_invoice_imports', 'finance_invoice_items'
  ] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- =============================================================================
-- Migration: despesas pontuais (Pix, débito, dinheiro)
-- =============================================================================
-- Gasto já PAGO, fora do cartão: "Corte de cabelo, R$ 50, Pix, Cuidados pessoais".
--
-- Por que uma tabela nova (e não reaproveitar o que existe):
--  - `finance_commitments` modela obrigações FUTURAS (vencimento, recorrência,
--    ocorrências a pagar): registrar um gasto já feito ali criaria compromissos
--    indevidos.
--  - `finance_invoice_items` pertence a uma fatura de cartão.
--  - `finance_transactions` é do módulo legado e usa as categorias legadas.
--
-- Reflexo financeiro: o saldo disponível é uma foto manual. Ao registrar, o
-- usuário escolhe se o valor sai do saldo (padrão: sim, igual a "marcar conta
-- como paga"); a gravação e o desconto acontecem na MESMA transação. A despesa
-- não entra na projeção como dívida: já foi paga.
--
-- Preparação para conciliação futura (sem importador nesta rodada): `kind`
-- distingue despesa de transferência interna e de pagamento de fatura (estes
-- dois NÃO contam como gasto nas análises), `source` ('manual' | 'bank_statement'),
-- `external_ref` (identificador do extrato) e `reconciled_at`.
--
-- Isolamento por workspace via RLS, igual ao restante do módulo. A categoria é o
-- id estável da lista do workspace (sem FK: lançamentos já seguem esse padrão).
-- =============================================================================

create table public.finance_expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 1 and 200),
  amount_cents bigint not null check (amount_cents > 0),
  spent_on date not null,
  payment_method text not null check (payment_method in ('pix', 'debit', 'cash', 'other')),
  category text check (category is null or category ~ '^[a-z_]{2,40}$'),
  deducted_from_balance boolean not null default false,
  kind text not null default 'expense' check (kind in ('expense', 'internal_transfer', 'invoice_payment')),
  source text not null default 'manual' check (source in ('manual', 'bank_statement')),
  external_ref text,
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index finance_expenses_workspace_date_idx on public.finance_expenses (workspace_id, spent_on desc);

create trigger finance_expenses_updated_at
  before update on public.finance_expenses
  for each row execute function public.set_updated_at();

alter table public.finance_expenses enable row level security;

create policy "finance_expenses_select" on public.finance_expenses
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_expenses_insert" on public.finance_expenses
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "finance_expenses_update" on public.finance_expenses
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "finance_expenses_delete" on public.finance_expenses
  for delete to authenticated using (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.finance_expenses to authenticated;
grant select, insert, update, delete on public.finance_expenses to service_role;

-- Registra a despesa e, se pedido, desconta do saldo disponível: tudo numa transação.
create or replace function public.finance_record_expense(
  p_workspace_id uuid,
  p_description text,
  p_amount_cents bigint,
  p_spent_on date,
  p_payment_method text,
  p_category text,
  p_deduct_from_balance boolean
)
returns public.finance_expenses
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.finance_expenses;
begin
  perform public.finance_assert_member(p_workspace_id);
  insert into public.finance_expenses
    (workspace_id, description, amount_cents, spent_on, payment_method, category, deducted_from_balance)
  values
    (p_workspace_id, btrim(p_description), p_amount_cents, p_spent_on, p_payment_method, nullif(p_category, ''), coalesce(p_deduct_from_balance, false))
  returning * into v_row;

  if coalesce(p_deduct_from_balance, false) then
    insert into public.finance_balance (workspace_id) values (p_workspace_id)
    on conflict (workspace_id) do nothing;
    update public.finance_balance
      set available_cents = available_cents - p_amount_cents, available_updated_at = now()
      where workspace_id = p_workspace_id;
  end if;
  return v_row;
end;
$$;

-- Exclui a despesa; com p_restore_balance devolve ao saldo o que foi descontado (só se foi descontado).
create or replace function public.finance_delete_expense(
  p_expense_id uuid,
  p_restore_balance boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.finance_expenses;
begin
  select * into v_row from public.finance_expenses where id = p_expense_id for update;
  if not found then
    raise exception 'Despesa não encontrada' using errcode = 'P0002';
  end if;
  perform public.finance_assert_member(v_row.workspace_id);
  delete from public.finance_expenses where id = p_expense_id;
  if coalesce(p_restore_balance, false) and v_row.deducted_from_balance then
    update public.finance_balance
      set available_cents = available_cents + v_row.amount_cents, available_updated_at = now()
      where workspace_id = v_row.workspace_id;
  end if;
end;
$$;

revoke execute on function public.finance_record_expense(uuid, text, bigint, date, text, text, boolean) from public, anon;
revoke execute on function public.finance_delete_expense(uuid, boolean) from public, anon;
grant execute on function public.finance_record_expense(uuid, text, bigint, date, text, text, boolean) to authenticated;
grant execute on function public.finance_delete_expense(uuid, boolean) to authenticated;

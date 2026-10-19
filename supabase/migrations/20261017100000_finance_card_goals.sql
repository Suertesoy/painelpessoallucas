-- =============================================================================
-- Migration: meta mensal conjunta dos cartões (Lucas e Matheus)
-- =============================================================================
-- A meta é um valor que o casal ESCOLHE junto para os dois cartões somados. Ela
-- não é o limite sustentável calculado pelo app e não altera faturas, saldos,
-- compromissos nem lançamentos: é só uma referência para acompanhar o mês.
--
-- Modelo (uma tabela, por workspace):
--   scope = 'default' → meta padrão A PARTIR de `month` (vale até aparecer
--                       outra meta padrão em um mês posterior);
--   scope = 'month'   → exceção só para `month`.
-- Valor efetivo de um mês M: exceção de M, senão a meta padrão de maior `month`
-- <= M, senão NENHUMA (o app mostra "Definir nossa meta mensal"). Nenhum valor
-- inicial é criado aqui: a tabela nasce vazia em todos os workspaces.
--
-- Isolamento por RLS (is_workspace_member), igual ao restante do módulo. Todos os
-- membros do workspace enxergam e editam a mesma meta (Lucas e Matheus na casa
-- compartilhada); terceiros e workspaces pessoais de outras pessoas não.
-- Publicada no Realtime para a meta aparecer no aparelho do outro na hora.
-- Aditiva: não toca em nenhuma tabela existente.
-- =============================================================================

create table public.finance_card_goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  scope text not null check (scope in ('default', 'month')),
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, scope, month)
);

create index finance_card_goals_workspace_month_idx on public.finance_card_goals (workspace_id, month);

create trigger finance_card_goals_updated_at
  before update on public.finance_card_goals
  for each row execute function public.set_updated_at();

alter table public.finance_card_goals enable row level security;

create policy "finance_card_goals_select" on public.finance_card_goals
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_card_goals_insert" on public.finance_card_goals
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "finance_card_goals_update" on public.finance_card_goals
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "finance_card_goals_delete" on public.finance_card_goals
  for delete to authenticated using (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.finance_card_goals to authenticated;
grant select, insert, update, delete on public.finance_card_goals to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'finance_card_goals'
  ) then
    alter publication supabase_realtime add table public.finance_card_goals;
  end if;
end
$$;

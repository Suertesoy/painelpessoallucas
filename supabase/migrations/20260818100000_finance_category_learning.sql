-- =============================================================================
-- Migration: categorias gerenciáveis e regras aprendidas (faturas)
-- =============================================================================
-- Uma ÚNICA fonte de verdade para categorias, por workspace:
--  - `finance_item_categories`: id ESTÁVEL (nunca muda) + nome exibido
--    (editável). Renomear altera só o nome: lançamentos e regras guardam o id.
--    O app semeia a lista inicial (as categorias domésticas) na primeira
--    leitura; depois disso a lista é do usuário (criar, renomear, excluir).
--    Os ids iniciais são os mesmos que o código já gravava
--    (groceries, restaurants, shopping, ...), então nada persistido muda.
--  - `finance_category_seed`: marca que a lista inicial já foi semeada, para
--    que excluir todas as categorias não as recrie sozinho.
--  - `finance_category_rules`: regra determinística "estabelecimento
--    normalizado [+ valor] => categoria". Referencia a categoria por id com
--    ON DELETE CASCADE: regra nunca fica apontando para categoria inexistente.
--    NÃO reaproveita a tabela legada `finance_classification_rules`.
--  - `finance_invoice_items` ganha PROVENIÊNCIA: category_source ('user' =
--    confirmada por você, 'rule' = aplicada por regra) e category_rule_id.
--    `purpose` continua existindo por compatibilidade (sem uso na interface).
--
-- Segurança: tudo isolado por workspace via RLS (is_workspace_member), igual ao
-- restante do módulo. A migration não faz UPDATE/DELETE em dados existentes.
-- =============================================================================

create table public.finance_item_categories (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  id text not null check (id ~ '^[a-z_]{2,40}$'),
  label text not null check (char_length(btrim(label)) between 2 and 40),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

-- Um nome por workspace (sem diferenciar maiúsculas/espaços nas pontas).
create unique index finance_item_categories_label_idx
  on public.finance_item_categories (workspace_id, lower(btrim(label)));

create trigger finance_item_categories_updated_at
  before update on public.finance_item_categories
  for each row execute function public.set_updated_at();

create table public.finance_category_seed (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  seeded_at timestamptz not null default now()
);

create table public.finance_category_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Descrição-base normalizada do estabelecimento (sem acentos, minúscula).
  merchant_key text not null check (char_length(btrim(merchant_key)) between 1 and 200),
  -- NULL = qualquer valor (só por autorização explícita); senão, valor exato em centavos.
  amount_cents bigint,
  category text not null check (category ~ '^[a-z_]{2,40}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, category)
    references public.finance_item_categories (workspace_id, id) on delete cascade
);

-- No máximo uma regra por (estabelecimento, valor|qualquer valor).
create unique index finance_category_rules_key_idx
  on public.finance_category_rules (workspace_id, merchant_key, coalesce(amount_cents, -9223372036854775808));

create index finance_category_rules_workspace_idx on public.finance_category_rules (workspace_id);

create trigger finance_category_rules_updated_at
  before update on public.finance_category_rules
  for each row execute function public.set_updated_at();

alter table public.finance_invoice_items
  add column category_source text check (category_source is null or category_source in ('user', 'rule')),
  add column category_rule_id uuid references public.finance_category_rules (id) on delete set null;

-- RLS ---------------------------------------------------------------------
alter table public.finance_item_categories enable row level security;
alter table public.finance_category_seed enable row level security;
alter table public.finance_category_rules enable row level security;

create policy "finance_item_categories_select" on public.finance_item_categories
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_item_categories_insert" on public.finance_item_categories
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "finance_item_categories_update" on public.finance_item_categories
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "finance_item_categories_delete" on public.finance_item_categories
  for delete to authenticated using (public.is_workspace_member(workspace_id));

create policy "finance_category_seed_select" on public.finance_category_seed
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_category_seed_insert" on public.finance_category_seed
  for insert to authenticated with check (public.is_workspace_member(workspace_id));

create policy "finance_category_rules_select" on public.finance_category_rules
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_category_rules_insert" on public.finance_category_rules
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "finance_category_rules_update" on public.finance_category_rules
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "finance_category_rules_delete" on public.finance_category_rules
  for delete to authenticated using (public.is_workspace_member(workspace_id));

-- Privilégios (a plataforma não concede automaticamente; mesma lição das migrations anteriores).
grant select, insert, update, delete on public.finance_item_categories to authenticated;
grant select, insert on public.finance_category_seed to authenticated;
grant select, insert, update, delete on public.finance_category_rules to authenticated;
grant select, insert, update, delete on public.finance_item_categories to service_role;
grant select, insert on public.finance_category_seed to service_role;
grant select, insert, update, delete on public.finance_category_rules to service_role;

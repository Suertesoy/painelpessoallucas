-- =============================================================================
-- Migration: categorias personalizadas e regras aprendidas (faturas)
-- =============================================================================
-- Menor evolução possível sobre o que já existe:
--  - `finance_invoice_items.category` já aceita qualquer id `[a-z_]{2,40}`;
--    categorias personalizadas são só ids novos, sem mudar essa coluna.
--  - `finance_custom_categories`: rótulo legível das categorias criadas pelo
--    usuário (as nativas continuam no código, em cash/domain/categories.ts).
--  - `finance_category_rules`: regra determinística "estabelecimento
--    normalizado [+ valor] => categoria". NÃO reaproveita a tabela legada
--    `finance_classification_rules` (módulo antigo de transações, outra
--    chave de categoria): evita duas fontes de verdade.
--  - `finance_invoice_items` ganha PROVENIÊNCIA da classificação:
--    category_source ('user' = confirmada por você, 'rule' = aplicada por
--    regra) e category_rule_id. Itens existentes ficam como estão (NULL).
--
-- Segurança: tudo isolado por workspace via RLS (is_workspace_member), igual
-- ao restante do módulo. Nada aqui altera valores, datas, vínculos de fatura
-- nem apaga dados; a migration não faz UPDATE em dados existentes.
-- =============================================================================

create table public.finance_custom_categories (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  id text not null check (id ~ '^[a-z_]{2,40}$'),
  label text not null check (char_length(btrim(label)) between 2 and 40),
  created_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

-- Um rótulo por workspace (sem diferenciar maiúsculas/espaços nas pontas).
create unique index finance_custom_categories_label_idx
  on public.finance_custom_categories (workspace_id, lower(btrim(label)));

create table public.finance_category_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Descrição-base normalizada do estabelecimento (sem acentos, minúscula).
  merchant_key text not null check (char_length(btrim(merchant_key)) between 1 and 200),
  -- NULL = qualquer valor (só por autorização explícita); senão, valor exato em centavos.
  amount_cents bigint,
  category text not null check (category ~ '^[a-z_]{2,40}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
alter table public.finance_custom_categories enable row level security;
alter table public.finance_category_rules enable row level security;

create policy "finance_custom_categories_select" on public.finance_custom_categories
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_custom_categories_insert" on public.finance_custom_categories
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
grant select, insert on public.finance_custom_categories to authenticated;
grant select, insert, update, delete on public.finance_category_rules to authenticated;
grant select, insert, update on public.finance_custom_categories to service_role;
grant select, insert, update, delete on public.finance_category_rules to service_role;

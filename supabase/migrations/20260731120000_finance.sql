-- =============================================================================
-- Migration: Módulo Finanças (importação, categorização, revisão, mensal)
-- =============================================================================
-- Primeira versão do módulo Finanças: importação de extrato/fatura (CSV/OFX),
-- categorização local determinística, revisão antes da confirmação, e
-- consolidação mensal da casa (sem dividir gasto por Lucas/Matheus).
--
-- Ao contrário de `20260731100000_shopping_lists.sql` (que só concedeu GRANT
-- numa segunda migration corretiva), esta migration já inclui RLS + GRANT no
-- mesmo arquivo — para não repetir "permission denied" em produção.
--
-- Categorias, origens de cartão e a linha de `finance_settings` NÃO são
-- semeadas aqui: como são tabelas por workspace, uma migration só alcançaria
-- os workspaces já existentes no momento em que ela roda (mesmo motivo de
-- `shopping_lists`/`learning_courses`). O seed idempotente acontece em
-- `ensureFinanceDefaults` (infraestrutura), chamado na primeira visita a
-- `/financas`.
--
-- Integridade entre workspaces: toda referência cruzada entre tabelas deste
-- módulo usa CHAVE ESTRANGEIRA COMPOSTA `(workspace_id, <entidade>_id)` contra
-- um `unique (workspace_id, id)` da tabela referenciada — nunca é possível
-- uma linha apontar para uma entidade de outro workspace, mesmo manipulando o
-- payload enviado ao servidor.
--
-- `finance_import_rows.possible_duplicate_transaction_id` e
-- `finance_transactions` têm dependência circular (uma linha pode apontar
-- para uma transação já confirmada; uma transação sempre nasce de uma linha)
-- — por isso essa FK específica é adicionada por ALTER TABLE depois que as
-- duas tabelas já existem, mais abaixo neste arquivo.
-- =============================================================================

-- =============================================================================
-- FINANCE_SETTINGS — 1 linha por workspace (valor padrão de renda do Matheus)
-- =============================================================================
create table public.finance_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  default_matheus_income_cents integer not null default 0 check (default_matheus_income_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id)
);

create trigger finance_settings_updated_at
  before update on public.finance_settings
  for each row execute function public.set_updated_at();

alter table public.finance_settings enable row level security;

create policy "finance_settings_select" on public.finance_settings
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_settings_insert" on public.finance_settings
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "finance_settings_update" on public.finance_settings
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
-- Sem delete: configuração nunca é removida, só atualizada.

-- =============================================================================
-- FINANCE_SOURCES — origens de importação (identificam arquivo/fatura, NUNCA
-- indicam quem fez a compra)
-- =============================================================================
create table public.finance_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('card', 'account')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name),
  unique (workspace_id, id)
);

create index finance_sources_workspace_idx on public.finance_sources (workspace_id);

create trigger finance_sources_updated_at
  before update on public.finance_sources
  for each row execute function public.set_updated_at();

alter table public.finance_sources enable row level security;

create policy "finance_sources_select" on public.finance_sources
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_sources_insert" on public.finance_sources
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "finance_sources_update" on public.finance_sources
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
-- Sem delete: origens já usadas por importações/transações são preservadas.

-- =============================================================================
-- FINANCE_CATEGORIES — editáveis, seed conservador aplicado por workspace
-- =============================================================================
create table public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  slug text not null,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug),
  unique (workspace_id, id)
);

create index finance_categories_workspace_idx on public.finance_categories (workspace_id);

create trigger finance_categories_updated_at
  before update on public.finance_categories
  for each row execute function public.set_updated_at();

alter table public.finance_categories enable row level security;

create policy "finance_categories_select" on public.finance_categories
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_categories_insert" on public.finance_categories
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "finance_categories_update" on public.finance_categories
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
-- Sem delete: categorias já usadas por transações são preservadas (evita
-- órfãos); "editável" nesta versão significa renomear/reordenar.

-- =============================================================================
-- FINANCE_CLASSIFICATION_RULES — regras aprendidas, isoladas por workspace
-- =============================================================================
create table public.finance_classification_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  match_type text not null check (match_type in ('exact', 'contains')),
  match_text text not null,
  category_id uuid not null,
  nature text check (
    nature in ('purchase', 'fee', 'transfer', 'invoice_payment', 'refund', 'unidentified_credit', 'ignored')
  ),
  created_at timestamptz not null default now(),
  unique (workspace_id, match_type, match_text),
  foreign key (workspace_id, category_id) references public.finance_categories (workspace_id, id) on delete cascade
);

create index finance_classification_rules_workspace_idx on public.finance_classification_rules (workspace_id);

alter table public.finance_classification_rules enable row level security;

create policy "finance_classification_rules_select" on public.finance_classification_rules
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_classification_rules_insert" on public.finance_classification_rules
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "finance_classification_rules_delete" on public.finance_classification_rules
  for delete to authenticated using (public.is_workspace_member(workspace_id));
-- Sem update: uma regra é criada ou removida, nunca editada in-place.

-- =============================================================================
-- FINANCE_IMPORTS — lote de importação (arquivo bruto nunca persiste)
-- =============================================================================
create table public.finance_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  source_id uuid not null,
  file_name text not null,
  file_sha256 text not null,
  format text not null check (format in ('csv', 'ofx')),
  status text not null default 'pending_review' check (status in ('pending_review', 'confirmed')),
  row_count integer not null default 0,
  statement_start date,
  statement_end date,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Único índice não parcial: nunca duas linhas para o mesmo hash na mesma
  -- origem/workspace, confirmada ou não — reimportação idempotente sem
  -- corrida (ver `create-finance-import.ts`).
  unique (workspace_id, source_id, file_sha256),
  unique (workspace_id, id),
  foreign key (workspace_id, source_id) references public.finance_sources (workspace_id, id) on delete restrict
);

create index finance_imports_workspace_idx on public.finance_imports (workspace_id, status);

create trigger finance_imports_updated_at
  before update on public.finance_imports
  for each row execute function public.set_updated_at();

alter table public.finance_imports enable row level security;

create policy "finance_imports_select" on public.finance_imports
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_imports_insert" on public.finance_imports
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "finance_imports_update" on public.finance_imports
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
-- Sem delete: importações são trilha de auditoria, mesmo pendentes.

-- =============================================================================
-- FINANCE_IMPORT_ROWS — linhas em revisão
-- =============================================================================
create table public.finance_import_rows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  import_id uuid not null,
  row_index integer not null,
  transaction_date date not null,
  description text not null,
  original_description text not null,
  amount_cents integer not null,
  fitid text,
  fingerprint text,
  category_id uuid not null,
  nature text not null check (
    nature in ('purchase', 'fee', 'transfer', 'invoice_payment', 'refund', 'unidentified_credit', 'ignored')
  ),
  suggested_category_id uuid,
  suggested_nature text check (
    suggested_nature in ('purchase', 'fee', 'transfer', 'invoice_payment', 'refund', 'unidentified_credit', 'ignored')
  ),
  classification_reason text,
  -- Duas colunas de possível duplicidade em vez de uma referência
  -- polimórfica (uma FK não pode apontar para duas tabelas diferentes):
  -- no máximo uma das duas pode estar preenchida.
  possible_duplicate_transaction_id uuid,
  possible_duplicate_import_row_id uuid,
  status text not null default 'pending_review' check (status in ('pending_review', 'confirmed', 'ignored')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, import_id, row_index),
  check (possible_duplicate_transaction_id is null or possible_duplicate_import_row_id is null),
  foreign key (workspace_id, import_id) references public.finance_imports (workspace_id, id) on delete cascade,
  foreign key (workspace_id, category_id) references public.finance_categories (workspace_id, id) on delete restrict,
  foreign key (workspace_id, suggested_category_id) references public.finance_categories (workspace_id, id) on delete set null,
  foreign key (workspace_id, possible_duplicate_import_row_id) references public.finance_import_rows (workspace_id, id) on delete set null
);

create index finance_import_rows_import_idx on public.finance_import_rows (workspace_id, import_id);

create trigger finance_import_rows_updated_at
  before update on public.finance_import_rows
  for each row execute function public.set_updated_at();

alter table public.finance_import_rows enable row level security;

create policy "finance_import_rows_select" on public.finance_import_rows
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_import_rows_insert" on public.finance_import_rows
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "finance_import_rows_update" on public.finance_import_rows
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
-- Sem delete: uma linha indesejada é marcada "ignored", nunca removida.

-- =============================================================================
-- FINANCE_TRANSACTIONS — confirmadas (só estas entram em gráficos/cálculos)
-- =============================================================================
create table public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  source_id uuid not null,
  import_id uuid not null,
  import_row_id uuid not null,
  transaction_date date not null,
  description text not null,
  original_description text not null,
  amount_cents integer not null,
  category_id uuid not null,
  nature text not null check (
    nature in ('purchase', 'fee', 'transfer', 'invoice_payment', 'refund', 'unidentified_credit', 'ignored')
  ),
  fitid text,
  fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  -- NULL nunca colide consigo mesmo em UNIQUE (semântica padrão do SQL) —
  -- múltiplas transações sem FITID convivem livremente; só duplica quando
  -- FITID realmente se repete na mesma origem.
  unique (workspace_id, source_id, fitid),
  foreign key (workspace_id, source_id) references public.finance_sources (workspace_id, id) on delete restrict,
  foreign key (workspace_id, import_id) references public.finance_imports (workspace_id, id) on delete restrict,
  foreign key (workspace_id, import_row_id) references public.finance_import_rows (workspace_id, id) on delete restrict,
  foreign key (workspace_id, category_id) references public.finance_categories (workspace_id, id) on delete restrict
);

create index finance_transactions_workspace_date_idx on public.finance_transactions (workspace_id, transaction_date);

create trigger finance_transactions_updated_at
  before update on public.finance_transactions
  for each row execute function public.set_updated_at();

alter table public.finance_transactions enable row level security;

create policy "finance_transactions_select" on public.finance_transactions
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_transactions_insert" on public.finance_transactions
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
-- Sem update/delete: uma transação confirmada é imutável nesta versão (ver
-- limitações no relatório final); correção passa por uma nova conferência
-- manual em versão futura.

-- Agora que finance_transactions existe, fecha a referência circular de
-- finance_import_rows.possible_duplicate_transaction_id.
alter table public.finance_import_rows
  add constraint finance_import_rows_possible_duplicate_transaction_fkey
  foreign key (workspace_id, possible_duplicate_transaction_id)
  references public.finance_transactions (workspace_id, id)
  on delete set null;

-- =============================================================================
-- FINANCE_MONTHLY_RECORDS — renda/disponível/guardado, um registro por mês
-- =============================================================================
create table public.finance_monthly_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  month date not null,
  matheus_income_cents integer not null default 0 check (matheus_income_cents >= 0),
  lucas_income_cents integer not null default 0 check (lucas_income_cents >= 0),
  other_income_cents integer not null default 0 check (other_income_cents >= 0),
  available_cash_cents integer not null default 0 check (available_cash_cents >= 0),
  saved_cash_cents integer not null default 0 check (saved_cash_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, month)
);

create index finance_monthly_records_workspace_idx on public.finance_monthly_records (workspace_id);

create trigger finance_monthly_records_updated_at
  before update on public.finance_monthly_records
  for each row execute function public.set_updated_at();

alter table public.finance_monthly_records enable row level security;

create policy "finance_monthly_records_select" on public.finance_monthly_records
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "finance_monthly_records_insert" on public.finance_monthly_records
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "finance_monthly_records_update" on public.finance_monthly_records
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
-- Sem delete: um mês registrado permanece no histórico.

-- =============================================================================
-- RPC: confirm_finance_import — confirmação transacional e idempotente
-- =============================================================================
-- SECURITY INVOKER (não DEFINER): todas as tabelas tocadas já têm RLS via
-- is_workspace_member e o chamador é sempre `authenticated` com os GRANTs
-- necessários (abaixo) — não há motivo para elevar privilégio. `search_path`
-- fixo evita sequestro de função por schema hostil. `select ... for update`
-- serializa confirmações concorrentes da MESMA importação (duplo clique/
-- retry de rede): a segunda chamada só prossegue depois que a primeira
-- confirma a transação e libera o lock, encontra status='confirmed' e
-- devolve o resultado existente sem inserir nada de novo. Nunca confia só na
-- RLS: revalida workspace_member explicitamente antes de agir, mesmo que a
-- ausência de linha via RLS já tivesse o mesmo efeito prático.
create or replace function public.confirm_finance_import(p_import_id uuid)
returns table (transaction_count integer, already_confirmed boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_status text;
  v_inserted_count integer := 0;
  v_existing_count integer := 0;
begin
  select workspace_id, status
    into v_workspace_id, v_status
  from public.finance_imports
  where id = p_import_id
  for update;

  if v_workspace_id is null then
    raise exception 'Importação não encontrada' using errcode = 'P0002';
  end if;

  if not public.is_workspace_member(v_workspace_id) then
    raise exception 'Sem permissão para confirmar esta importação' using errcode = '42501';
  end if;

  if v_status = 'confirmed' then
    select count(*) into v_existing_count from public.finance_transactions where import_id = p_import_id;
    return query select v_existing_count, true;
    return;
  end if;

  insert into public.finance_transactions (
    id, workspace_id, source_id, import_id, import_row_id, transaction_date,
    description, original_description, amount_cents, category_id, nature, fitid, fingerprint
  )
  select
    gen_random_uuid(), r.workspace_id, i.source_id, r.import_id, r.id, r.transaction_date,
    r.description, r.original_description, r.amount_cents, r.category_id, r.nature, r.fitid, r.fingerprint
  from public.finance_import_rows r
  join public.finance_imports i on i.id = r.import_id
  where r.import_id = p_import_id
    and r.status <> 'ignored'
  on conflict (workspace_id, source_id, fitid) do nothing;

  get diagnostics v_inserted_count = row_count;

  update public.finance_import_rows
  set status = 'confirmed'
  where import_id = p_import_id
    and status <> 'ignored';

  update public.finance_imports
  set status = 'confirmed', confirmed_at = now()
  where id = p_import_id;

  return query select v_inserted_count, false;
end;
$$;

-- Função criada implicitamente com EXECUTE para PUBLIC — revogar
-- explicitamente de public/anon e conceder só a authenticated (mesma lição
-- de 20260722150000_workspace_function_grants.sql).
revoke execute on function public.confirm_finance_import(uuid) from public;
revoke execute on function public.confirm_finance_import(uuid) from anon;
grant execute on function public.confirm_finance_import(uuid) to authenticated;

-- =============================================================================
-- REALTIME
-- =============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'finance_settings'
  ) then
    execute 'alter publication supabase_realtime add table public.finance_settings';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'finance_sources'
  ) then
    execute 'alter publication supabase_realtime add table public.finance_sources';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'finance_categories'
  ) then
    execute 'alter publication supabase_realtime add table public.finance_categories';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'finance_classification_rules'
  ) then
    execute 'alter publication supabase_realtime add table public.finance_classification_rules';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'finance_imports'
  ) then
    execute 'alter publication supabase_realtime add table public.finance_imports';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'finance_import_rows'
  ) then
    execute 'alter publication supabase_realtime add table public.finance_import_rows';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'finance_transactions'
  ) then
    execute 'alter publication supabase_realtime add table public.finance_transactions';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'finance_monthly_records'
  ) then
    execute 'alter publication supabase_realtime add table public.finance_monthly_records';
  end if;
end
$$;

-- =============================================================================
-- GRANTS — authenticated (exatamente as operações cobertas pelas policies
-- acima) e service_role (mesmo escopo conservador do resto do projeto: só
-- leitura, para uma eventual automação futura; nenhuma rotina server-side
-- escreve neste módulo hoje). anon: nada, em nenhuma tabela.
-- =============================================================================
grant select, insert, update on public.finance_settings to authenticated;
grant select, insert, update on public.finance_sources to authenticated;
grant select, insert, update on public.finance_categories to authenticated;
grant select, insert, delete on public.finance_classification_rules to authenticated;
grant select, insert, update on public.finance_imports to authenticated;
grant select, insert, update on public.finance_import_rows to authenticated;
grant select, insert on public.finance_transactions to authenticated;
grant select, insert, update on public.finance_monthly_records to authenticated;

grant select on public.finance_settings to service_role;
grant select on public.finance_sources to service_role;
grant select on public.finance_categories to service_role;
grant select on public.finance_classification_rules to service_role;
grant select on public.finance_imports to service_role;
grant select on public.finance_import_rows to service_role;
grant select on public.finance_transactions to service_role;
grant select on public.finance_monthly_records to service_role;

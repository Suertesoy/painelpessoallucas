-- =============================================================================
-- Migration: Lista de compras (listas Mercado/Internet + vínculo com items)
-- =============================================================================
-- Reaproveita a entidade `items` existente (type = 'shopping_item') para o
-- conteúdo comprável — esta migration só acrescenta o conceito de "lista" e
-- o vínculo entre um item de compra e sua lista. As listas Mercado/Internet
-- em si NÃO são semeadas aqui: como `shopping_lists` é uma tabela por
-- workspace, uma migration só alcançaria os workspaces já existentes no
-- momento em que ela roda. O cadastro idempotente acontece em
-- ShoppingCommands.ensureDefaultLists (mesmo padrão já usado por
-- LearningCommands.initializeDefaultLearningContent), chamado na primeira
-- visita a /compras — e também a partir da confirmação de uma captura
-- shopping_item, para que a lista de destino sempre exista antes do vínculo.
--
-- Consequência de publicar o código desta entrega ANTES de aplicar esta
-- migration: `shopping_lists` e `items.shopping_list_id` não existiriam no
-- Supabase remoto. A UI falha de forma segura (mensagem de erro tratada via
-- useReactiveQuery, nunca uma tela quebrada) — ver docs/ARCHITECTURE.md.
-- =============================================================================

-- =============================================================================
-- SHOPPING_LISTS
-- =============================================================================
create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  slug text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create index shopping_lists_workspace_idx on public.shopping_lists (workspace_id);

create trigger shopping_lists_updated_at
  before update on public.shopping_lists
  for each row execute function public.set_updated_at();

alter table public.shopping_lists enable row level security;

create policy "shopping_lists_select" on public.shopping_lists
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "shopping_lists_insert" on public.shopping_lists
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "shopping_lists_update" on public.shopping_lists
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "shopping_lists_delete" on public.shopping_lists
  for delete to authenticated using (public.is_workspace_member(workspace_id));

-- =============================================================================
-- ITEMS: vínculo com a lista de compras (aditivo, nulo por padrão)
-- =============================================================================
alter table public.items
  add column shopping_list_id uuid references public.shopping_lists (id) on delete set null;

create index items_shopping_list_idx on public.items (shopping_list_id)
  where deleted_at is null and type = 'shopping_item';

-- =============================================================================
-- WORKSPACE_SETTINGS: número de WhatsApp para compartilhar a lista de compras
-- =============================================================================
-- Nunca hardcoded: começa nulo em todo workspace, preenchido pela interface
-- (Configurações → "WhatsApp para compartilhar compras"). Não é segredo (é um
-- número de contato pessoal do usuário), mas nunca é enviado ao build nem a
-- variável pública — persiste no mesmo padrão de workspace_settings (RLS,
-- já publicado no realtime).
alter table public.workspace_settings
  add column shopping_whatsapp_number text;

-- =============================================================================
-- REALTIME: publica shopping_lists (items e workspace_settings já publicados)
-- =============================================================================
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shopping_lists'
  ) then
    execute 'alter publication supabase_realtime add table public.shopping_lists';
  end if;
end
$$;

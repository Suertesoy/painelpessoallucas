-- =============================================================================
-- Migration: Privilégios de API para public.shopping_lists
-- =============================================================================
-- Causa raiz: 20260731100000_shopping_lists.sql criou a tabela, o RLS e as
-- policies, mas — repetindo a lacuna já corrigida para as demais tabelas em
-- 20260722140000_api_role_grants.sql — nunca concedeu os privilégios de
-- PostgreSQL (GRANT) que authenticated precisa para sequer tentar uma
-- operação. Sem GRANT, o Postgres nega o acesso na camada de privilégios da
-- tabela, antes de avaliar qualquer policy de RLS: é exatamente isso que
-- produz "permission denied for table shopping_lists" em /compras e na
-- confirmação de captura de shopping_item.
--
-- Segue o mesmo escopo mínimo de 20260722140000_api_role_grants.sql:
--   - authenticated: exatamente as operações cobertas pelas policies de RLS
--     já existentes (select/insert/update/delete, todas via
--     is_workspace_member).
--   - service_role: select/insert/update — nenhum código atual escreve em
--     shopping_lists pelo cliente administrativo, mas o mesmo padrão
--     conservador usado para workspace_settings/items é aplicado aqui para
--     uma eventual automação futura; sem delete, pelo mesmo motivo dos
--     demais grants a service_role (nenhuma rotina apaga listas).
--   - anon: nenhum privilégio (inalterado).
-- =============================================================================

grant select, insert, update, delete on public.shopping_lists to authenticated;

grant select, insert, update on public.shopping_lists to service_role;

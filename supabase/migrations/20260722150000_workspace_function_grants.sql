-- =============================================================================
-- Migration: Privilégio mínimo em public.ensure_personal_workspace()
-- =============================================================================
-- Achado do diagnóstico de sincronização (não relacionado à causa raiz do
-- problema mobile): a migration 20260716120000_core_schema.sql tentou negar
-- acesso a `anon` com `revoke all on function ... from anon`, mas a função
-- foi criada com EXECUTE concedido implicitamente a PUBLIC (comportamento
-- padrão do Postgres ao criar uma função). Revogar de um papel que só herda
-- via PUBLIC não bloqueia nada — a ACL remota confirmada em auditoria
-- (`{=X/postgres,postgres=X/postgres}`) mostra que PUBLIC, e portanto também
-- `anon`, ainda podiam chamar a função.
--
-- Esta migration remove o EXECUTE de PUBLIC (o que finalmente bloqueia
-- `anon`) e concede EXECUTE explicitamente só a `authenticated`, que é quem
-- de fato precisa chamar esta RPC pelo cliente do navegador. A função
-- continua SECURITY DEFINER e seu comportamento para usuários autenticados
-- não muda em nada.
--
-- Correção secundária de segurança — não é a causa da falta de sincronização
-- de projetos entre dispositivos, que segue sob investigação.
-- =============================================================================

revoke execute on function public.ensure_personal_workspace() from public;
revoke execute on function public.ensure_personal_workspace() from anon;
grant execute on function public.ensure_personal_workspace() to authenticated;

-- =============================================================================
-- Migration: Privilégios de API para authenticated e service_role
-- =============================================================================
-- Causa raiz: o projeto Supabase foi criado com a exposição automática de
-- novas tabelas desativada. As seis migrations anteriores criaram tabelas,
-- RLS e policies corretamente, mas nunca concederam os privilégios de
-- PostgreSQL (GRANT) que authenticated e service_role precisam para sequer
-- tentar uma operação — sem esses privilégios, o Postgres nega o acesso na
-- camada de permissões da tabela, antes mesmo de avaliar qualquer policy de
-- RLS. É exatamente isso que produz "permission denied for table projects".
--
-- Esta migration concede apenas os privilégios comprovadamente necessários,
-- tabela a tabela, com base numa auditoria do código (repositórios, route
-- handlers e do assistente de migração local → nuvem):
--   - authenticated: exatamente as operações cobertas por policy de RLS
--     (grant sem policy correspondente seria um privilégio morto — RLS
--     bloquearia todas as linhas mesmo assim).
--   - service_role: exatamente as tabelas e operações tocadas pelo cliente
--     administrativo (cron de automações e integrações Google/Gmail no
--     servidor). service_role já bypassa RLS por definição da plataforma,
--     mas GRANT e RLS são camadas independentes — bypass de RLS não bypassa
--     a checagem de privilégio de tabela.
--   - anon: nenhum privilégio. A aplicação não usa o papel anon para
--     acessar tabelas pessoais (login é via OAuth/GoTrue; a única rota
--     pública, /api/health, não toca o banco).
--   - integration_tokens: nenhuma policy de RLS existe para authenticated
--     nesta tabela (ver 20260717110000_integrations.sql) — por isso nenhum
--     GRANT é concedido a authenticated aqui. Tokens só são lidos/escritos
--     pelo service_role (cliente admin, server-only).
--
-- Nenhuma tabela usa sequences (todos os IDs são uuid via gen_random_uuid()),
-- portanto não há GRANT de sequence a conceder.
-- =============================================================================

-- Uso do schema: apenas os papéis que efetivamente acessam tabelas nele.
grant usage on schema public to authenticated;
grant usage on schema public to service_role;

-- =============================================================================
-- authenticated — via clientes com sessão do usuário (browser e Route
-- Handlers), sempre sujeitos a RLS. Escopo idêntico ao das policies.
-- =============================================================================

grant select, update on public.profiles to authenticated;

grant select, update on public.workspaces to authenticated;

grant select on public.workspace_members to authenticated;

grant select, insert, update, delete on public.projects to authenticated;

grant select, insert, update, delete on public.items to authenticated;

grant select, insert, update, delete on public.daily_plans to authenticated;

grant select, insert, update, delete on public.daily_plan_items to authenticated;

grant select, insert, update, delete on public.item_relations to authenticated;

-- domain_events: append-only — sem update/delete para o cliente.
grant select, insert on public.domain_events to authenticated;

grant select, insert, update, delete on public.source_documents to authenticated;

grant select, insert, update, delete on public.execution_plans to authenticated;

grant select, insert, update, delete on public.plan_phases to authenticated;

grant select, insert, update, delete on public.plan_actions to authenticated;

grant select, insert, update, delete on public.recurrence_rules to authenticated;

grant select, insert, update, delete on public.reminders to authenticated;

grant select, insert, update, delete on public.notifications to authenticated;

-- ai_runs: sem delete — execuções são histórico auditável.
grant select, insert, update on public.ai_runs to authenticated;

grant select, insert, update, delete on public.integration_accounts to authenticated;

-- integration_tokens: propositalmente SEM grant a authenticated (ver acima).

grant select, insert, update, delete on public.calendar_event_links to authenticated;

-- workspace_settings: sem delete — preferências são atualizadas, não removidas.
grant select, insert, update on public.workspace_settings to authenticated;

-- automation_runs: cliente só lê; escrita é exclusiva do servidor.
grant select on public.automation_runs to authenticated;

-- =============================================================================
-- service_role — via cliente administrativo (server-only), usado pelo cron
-- horário de automações e pelas integrações Google/Gmail no servidor.
-- Escopo restrito às tabelas e operações que esse código de fato executa.
-- =============================================================================

-- Cron lista todos os workspaces para iterar; nunca escreve na tabela.
grant select on public.workspaces to service_role;

-- Fila de trabalhos idempotentes do cron (claim/transição de status).
grant select, insert, update on public.automation_runs to service_role;

-- Materialização de recorrências vencidas (cron): lê regras e ações, e
-- materializa/concilia itens.
grant select, update on public.recurrence_rules to service_role;
grant select on public.plan_actions to service_role;
grant select, insert, update on public.items to service_role;

-- Lembretes vencidos → notificações (cron).
grant select, update on public.reminders to service_role;
grant insert on public.notifications to service_role;

-- Integrações Google: status/metadata da conta (leitura + atualização de
-- app_calendar_id, verificação e revogação) feitas pelo servidor.
grant select, update on public.integration_accounts to service_role;

-- integration_tokens: acesso total, exclusivo do servidor (criptografados;
-- nunca chegam ao navegador).
grant select, insert, update, delete on public.integration_tokens to service_role;

-- Sincronização de eventos do Calendar (cron e rotas de sync sob demanda).
grant select, insert, update on public.calendar_event_links to service_role;

-- Resumos por e-mail (cron): lê preferências e o plano do dia, registra o
-- evento de envio.
grant select on public.workspace_settings to service_role;
grant select on public.daily_plans to service_role;
grant insert on public.domain_events to service_role;

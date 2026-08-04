-- =============================================================================
-- Migration: Projeto por PlanAction (inherit | specific | none)
-- =============================================================================
-- Causa raiz do problema de produto corrigido aqui: o plano importado tinha um
-- único project_id no nível do execution_plan, e toda ação materializada em
-- item nunca recebia project_id nenhum (nem herdado, nem próprio) — items.
-- project_id sempre ficava null, mesmo quando o plano tinha um projeto
-- principal claro. Isso fazia toda ocorrência de plano cair em "sem projeto"
-- na revisão (ItemQueries.getReviewOverview) e nunca aparecer na página do
-- projeto (filtro item.projectId === projectId).
--
-- Além disso, um documento de planejamento pode legitimamente conter ações de
-- múltiplos projetos ou sem projeto (ex.: "Estudo de japonês" dentro do plano
-- do projeto "Almeida Ambiental") — vincular toda ação ao projeto do plano
-- por padrão seria uma suposição errada da IA. project_assignment torna essa
-- decisão explícita por ação, em vez de um project_id nullable sozinho (que
-- seria ambíguo entre "herda do plano" e "não tem projeto").
-- =============================================================================

alter table public.plan_actions
  add column project_assignment text not null default 'inherit'
    check (project_assignment in ('inherit', 'specific', 'none')),
  add column project_id uuid references public.projects (id) on delete set null,
  -- Nome de projeto sugerido pela IA sem correspondência entre os projetos
  -- existentes — nunca cria projeto silenciosamente; fica aqui só para a
  -- revisão humana confirmar ou descartar a sugestão.
  add column suggested_project_name text;

-- Invariante de consistência espelhando o refine do domínio
-- (PlanActionSchema, modules/plans/domain/plan.schema.ts): project_id só
-- pode existir quando project_assignment é "specific", e é obrigatório nesse
-- caso — nunca um estado ambíguo persistido no banco.
alter table public.plan_actions
  add constraint plan_actions_project_assignment_consistency
  check (
    (project_assignment = 'specific' and project_id is not null)
    or (project_assignment <> 'specific' and project_id is null)
  );

-- service_role (cliente admin do cron de automações) passou a resolver o
-- projeto do plano de cada regra vencida em materializeDueRules — sem este
-- grant, o cron falharia com "permission denied for table execution_plans"
-- (mesma causa raiz já documentada em 20260722140000_api_role_grants.sql).
grant select on public.execution_plans to service_role;

-- =============================================================================
-- Backfill: items já materializados por planos antes desta correção nunca
-- receberam project_id (bug, não comportamento intencional). Preenche
-- somente onde items.project_id ainda está null — nunca sobrescreve uma
-- edição manual do usuário nem um valor já atribuído por qualquer outro
-- caminho. Linhas legadas de plan_actions nascem com project_assignment
-- 'inherit' (default acima), então o backfill sempre resolve para o
-- project_id do plano.
-- =============================================================================
update public.items i
set project_id = case
    when pa.project_assignment = 'specific' then pa.project_id
    when pa.project_assignment = 'none' then null
    else ep.project_id
  end
from public.plan_actions pa
join public.execution_plans ep on ep.id = pa.execution_plan_id
where i.plan_action_id = pa.id
  and i.project_id is null
  and ep.project_id is not null;

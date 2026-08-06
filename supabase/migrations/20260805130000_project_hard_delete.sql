-- =============================================================================
-- Migration: Exclusão permanente de projeto (delete_project_permanently)
-- =============================================================================
-- Causa raiz do problema de produto corrigido aqui: não existia nenhuma forma
-- de remover de verdade um projeto de teste/lixo (ex.: "Teste nuvem") — só
-- soft delete morto (deleted_at, sem nenhum fluxo real de UI/Command) e
-- arquivamento (reversível). Adicionar um DELETE físico simples em
-- `projects` não é seguro sozinho: `plan_actions.project_id` tem
-- `on delete set null` (20260805100000_plan_action_project_assignment.sql),
-- mas a constraint `plan_actions_project_assignment_consistency` exige
-- `project_id is not null` sempre que `project_assignment = 'specific'` — um
-- DELETE cru deixaria `project_assignment = 'specific'` com `project_id`
-- nulo, violando o CHECK. Por isso a exclusão permanente precisa ser uma
-- função transacional que corrige `plan_actions` ANTES de apagar a linha.
--
-- `items.project_id`, `source_documents.project_id` e
-- `execution_plans.project_id` já são `on delete set null` — preservados
-- automaticamente pelo Postgres, sem necessidade de lógica extra aqui.
-- `domain_events.entity_id` é texto livre sem FK (log append-only) — nunca
-- quebra, só registramos o evento de auditoria antes do DELETE (nunca depois,
-- já que a linha do projeto não existiria mais para referenciar o nome).
--
-- SECURITY INVOKER (não DEFINER): RLS de `projects`/`plan_actions`/
-- `domain_events` já cobre `authenticated`/`is_workspace_member` (mesmas 4
-- policies padrão de todo o schema) — não há motivo para elevar privilégio
-- nem usar service_role. `search_path` fixo evita sequestro de função por
-- schema hostil. `for update` trava a linha do projeto contra chamadas
-- concorrentes (duplo clique). Guarda `status <> 'archived'` reforçada aqui
-- no servidor — nunca confia só na checagem do cliente.
-- =============================================================================

create or replace function public.delete_project_permanently(p_project_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_status text;
  v_name text;
begin
  select workspace_id, status, name
    into v_workspace_id, v_status, v_name
  from public.projects
  where id = p_project_id
  for update;

  if v_workspace_id is null then
    raise exception 'Projeto não encontrado' using errcode = 'P0002';
  end if;

  if not public.is_workspace_member(v_workspace_id) then
    raise exception 'Sem permissão para excluir este projeto' using errcode = '42501';
  end if;

  if v_status <> 'archived' then
    raise exception 'Só é possível excluir permanentemente um projeto arquivado' using errcode = 'P0001';
  end if;

  -- Corrige plan_actions ANTES do delete: nunca deixa project_assignment
  -- 'specific' com project_id nulo (violaria
  -- plan_actions_project_assignment_consistency assim que o FK zerasse
  -- project_id sozinho).
  update public.plan_actions
  set project_assignment = 'none',
      project_id = null
  where project_id = p_project_id;

  insert into public.domain_events (id, workspace_id, type, entity_id, source, payload, created_at)
  values (
    gen_random_uuid(),
    v_workspace_id,
    'project.deleted_permanently',
    p_project_id::text,
    'manual',
    jsonb_build_object('name', v_name),
    now()
  );

  delete from public.projects where id = p_project_id;
end;
$$;

-- Função criada implicitamente com EXECUTE para PUBLIC — revogar
-- explicitamente de public/anon e conceder só a authenticated (mesma lição
-- de 20260722150000_workspace_function_grants.sql e
-- 20260731120000_finance.sql#confirm_finance_import).
revoke execute on function public.delete_project_permanently(uuid) from public;
revoke execute on function public.delete_project_permanently(uuid) from anon;
grant execute on function public.delete_project_permanently(uuid) to authenticated;

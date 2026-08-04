-- Repara plan_actions.due_rule/schedule_rule persistidos antes da correção do
-- contrato IA→domínio (suggestedDue/suggestedStart sem validação de formato
-- podiam gravar texto livre onde o domínio exige YYYY-MM-DD, quebrando a
-- leitura do plano com um ZodError). NUNCA destrutiva: normaliza somente o
-- campo inválido para null, preserva a ação e sinaliza requires_confirmation
-- para revisão humana. Também adiciona o índice único usado pela
-- materialização idempotente de ações de ocorrência única em `items`.

-- 1. Recupera schedule_rule.suggestedStart (formato antigo) quando o valor é
--    uma data válida, migrando para o novo formato { dateRule: { type: 'fixed', date } }.
update public.plan_actions
set schedule_rule = (schedule_rule - 'suggestedStart') ||
  jsonb_build_object(
    'dateRule',
    jsonb_build_object('type', 'fixed', 'date', schedule_rule ->> 'suggestedStart')
  )
where schedule_rule ? 'suggestedStart'
  and schedule_rule ->> 'suggestedStart' ~ '^\d{4}-\d{2}-\d{2}$';

-- 2. suggestedStart não recuperável (não é uma data válida): remove a chave
--    obsoleta e sinaliza a ação para revisão humana.
update public.plan_actions
set schedule_rule = schedule_rule - 'suggestedStart',
    requires_confirmation = true
where schedule_rule ? 'suggestedStart';

-- 3. schedule_rule vazio (objeto sem nenhuma chave útil) normaliza para null.
update public.plan_actions
set schedule_rule = null
where schedule_rule = '{}'::jsonb;

-- 4. due_rule que não corresponde ao contrato Zod (PlanDateRuleSchema) nunca
--    deve permanecer no banco — normaliza para null e sinaliza revisão.
--    Cobre: type desconhecido, "fixed" com data fora do formato YYYY-MM-DD, e
--    offset_from_start/offset_from_phase com "days" ausente ou não numérico.
update public.plan_actions
set due_rule = null,
    requires_confirmation = true
where due_rule is not null
  and not (
    (due_rule ->> 'type' = 'fixed' and due_rule ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$')
    or (due_rule ->> 'type' = 'offset_from_start' and due_rule ->> 'days' ~ '^\d+$')
    or (due_rule ->> 'type' = 'offset_from_phase' and due_rule ->> 'days' ~ '^\d+$')
  );

-- 5. Índice único: uma ação de plano gera no máximo um item materializado
--    (ativar, recarregar ou reexecutar a automação nunca duplica).
create unique index if not exists items_plan_action_idx
  on public.items (plan_action_id)
  where plan_action_id is not null;

-- =============================================================================
-- Migration: exclusão LÓGICA de sessões de treino (histórico)
-- =============================================================================
-- Permite remover do histórico uma sessão indesejada (ex.: duração absurda)
-- sem perder dados: a sessão ganha `deleted_at`; séries e conclusões de ficha
-- continuam gravadas e voltam juntas se a sessão for restaurada.
--
--  * Excluir/restaurar atua na SESSÃO inteira (nunca parcialmente): uma sessão
--    geral que passou por várias fichas é tratada como uma unidade.
--  * Aditiva e compatível: coluna nula por padrão, nenhuma linha é alterada.
--  * A função confere workspace (is_workspace_member) E atleta: não exclui a
--    sessão de outra pessoa mesmo que o id seja de outro atleta do workspace.
--  * Sessão EM ANDAMENTO não pode ser excluída (encerre ou cancele antes).
--  * Idempotente: excluir duas vezes mantém o primeiro deleted_at.
--  * Sem DELETE: nenhuma política nova de remoção física.
-- =============================================================================

alter table public.workout_sessions add column deleted_at timestamptz;

create index workout_sessions_active_history_idx
  on public.workout_sessions (athlete_id, started_at desc) where deleted_at is null;

create or replace function public.workout_set_session_deleted(
  p_session_id uuid,
  p_athlete_id uuid,
  p_deleted boolean
)
returns public.workout_sessions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session public.workout_sessions;
begin
  select * into v_session from public.workout_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Sessão não encontrada' using errcode = 'P0002';
  end if;
  if not public.is_workspace_member(v_session.workspace_id) then
    raise exception 'Sem acesso ao workspace' using errcode = '42501';
  end if;
  if v_session.athlete_id <> p_athlete_id then
    raise exception 'ATHLETE_MISMATCH' using errcode = 'P0001';
  end if;
  if p_deleted and v_session.status = 'in_progress' then
    raise exception 'SESSION_IN_PROGRESS' using errcode = 'P0001';
  end if;

  update public.workout_sessions
    set deleted_at = case when p_deleted then coalesce(deleted_at, now()) else null end
    where id = p_session_id
    returning * into v_session;
  return v_session;
end;
$$;

revoke execute on function public.workout_set_session_deleted(uuid, uuid, boolean) from public, anon;
grant execute on function public.workout_set_session_deleted(uuid, uuid, boolean) to authenticated;

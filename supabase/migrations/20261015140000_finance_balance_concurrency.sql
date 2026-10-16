-- =============================================================================
-- Migration: ajuste de saldo sem atualização perdida (dois aparelhos)
-- =============================================================================
-- Problema: finance_set_balance grava uma "foto" absoluta. Se Lucas e Matheus
-- abrem o ajuste ao mesmo tempo, quem salva por último apagava, em silêncio, o
-- que o outro fez (inclusive recebimentos somados ao saldo no intervalo).
-- A checagem feita só no navegador deixava uma janela entre ler e gravar.
--
-- Correção mínima e atômica: uma função NOVA que, na mesma transação,
--   1) trava a linha do saldo (SELECT ... FOR UPDATE: o segundo ajuste espera);
--   2) compara a versão (updated_at da linha) com a que a tela leu;
--   3) só então grava. Se mudou, falha com 40001 (serialization_failure).
-- A versão usada é updated_at da linha (o trigger a muda em QUALQUER alteração:
-- ajuste manual, recebimento somado, pagamento descontado, transferência).
--
-- Compatibilidade: finance_set_balance(uuid,bigint,bigint) NÃO é alterada nem
-- removida — o aplicativo atualmente publicado continua funcionando. O app novo
-- chama a função nova e, se ela ainda não existir, cai no comportamento antigo.
--
-- Recebimentos e compromissos já são atômicos: o app faz UPDATE condicional
-- (... WHERE updated_at = <versão lida>), uma única instrução. Marcar recebido/
-- pago/transferir continuam idempotentes (RPCs existentes, intactas).
-- =============================================================================

create or replace function public.finance_set_balance_checked(
  p_workspace_id uuid,
  p_available_cents bigint,
  p_reserve_cents bigint,
  p_expected_version timestamptz
)
returns public.finance_balance
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_balance public.finance_balance;
  v_existed boolean;
begin
  perform public.finance_assert_member(p_workspace_id);
  if p_reserve_cents is not null and p_reserve_cents < 0 then
    raise exception 'A reserva não pode ser negativa' using errcode = '22023';
  end if;

  v_existed := exists (select 1 from public.finance_balance where workspace_id = p_workspace_id);

  insert into public.finance_balance (workspace_id) values (p_workspace_id)
  on conflict (workspace_id) do nothing;

  -- Serializa ajustes concorrentes: o segundo espera o primeiro terminar.
  select * into v_balance from public.finance_balance
  where workspace_id = p_workspace_id
  for update;

  -- Versão esperada nula = "a tela viu que ainda não havia saldo".
  if v_existed and v_balance.updated_at is distinct from p_expected_version then
    raise exception 'O saldo foi alterado por outra pessoa. Confira o valor atual antes de salvar.'
      using errcode = '40001';
  end if;
  if not v_existed and p_expected_version is not null then
    raise exception 'O saldo foi alterado por outra pessoa. Confira o valor atual antes de salvar.'
      using errcode = '40001';
  end if;

  update public.finance_balance
    set available_cents = coalesce(p_available_cents, available_cents),
        available_updated_at = case when p_available_cents is null then available_updated_at else now() end,
        reserve_cents = coalesce(p_reserve_cents, reserve_cents),
        reserve_updated_at = case when p_reserve_cents is null then reserve_updated_at else now() end
    where workspace_id = p_workspace_id
    returning * into v_balance;
  return v_balance;
end;
$$;

revoke execute on function public.finance_set_balance_checked(uuid, bigint, bigint, timestamptz) from public, anon;
grant execute on function public.finance_set_balance_checked(uuid, bigint, bigint, timestamptz) to authenticated;

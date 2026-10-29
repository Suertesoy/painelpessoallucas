-- =============================================================================
-- Migration: importação de fatura sem colisão ao atualizar datas
-- =============================================================================
-- Causa comprovada da falha "Não foi possível salvar a importação": os UPDATEs
-- de data mantinham o occurrence_index, e a chave única
--   (workspace_id, invoice_id, purchase_date, normalized_description,
--    amount_cents, occurrence_index)
-- era violada (SQLSTATE 23505) quando dois lançamentos idênticos (ex.: duas
-- parcelas 2/3 do mesmo valor) passavam à mesma data.
--
-- Esta versão aplica o occurrence_index livre calculado pelo servidor para cada
-- atualização, em duas fases (libera os índices e só então grava os finais),
-- evitando colisão até em trocas entre itens. Mesma assinatura: grants e
-- idempotência por request_id são preservados. Não altera nenhum dado existente.
-- =============================================================================

create or replace function public.finance_apply_invoice_import(
  p_workspace_id uuid,
  p_card text,
  p_month text,
  p_due_date date,
  p_new_status text,
  p_request_id uuid,
  p_expected_rev integer,
  p_file_name text,
  p_file_sha256 text,
  p_plan jsonb
)
returns table (out_invoice_id uuid, out_already_applied boolean, out_rev integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inv public.finance_card_invoices;
  v_import_id uuid;
  v_existing_invoice_id uuid;
  v_counts jsonb := coalesce(p_plan -> 'counts', '{}'::jsonb);
begin
  perform public.finance_assert_member(p_workspace_id);
  if p_card not in ('nubank_1', 'nubank_2') then
    raise exception 'Cartão inválido' using errcode = '22023';
  end if;
  if p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Mês inválido' using errcode = '22023';
  end if;
  if p_new_status is not null and p_new_status not in ('open', 'closed') then
    raise exception 'Status inválido' using errcode = '22023';
  end if;

  select i.invoice_id into v_existing_invoice_id from public.finance_invoice_imports i
    where i.workspace_id = p_workspace_id and i.request_id = p_request_id;
  if found then
    select * into v_inv from public.finance_card_invoices where id = v_existing_invoice_id;
    return query select v_inv.id, true, v_inv.rev;
    return;
  end if;

  insert into public.finance_card_invoices (workspace_id, card, month, due_date)
  values (p_workspace_id, p_card, p_month, p_due_date)
  on conflict (workspace_id, card, month) do nothing;

  select * into v_inv from public.finance_card_invoices
    where workspace_id = p_workspace_id and card = p_card and month = p_month for update;

  if v_inv.rev <> p_expected_rev then
    raise exception 'STALE_INVOICE' using errcode = 'P0001';
  end if;

  insert into public.finance_invoice_imports (
    workspace_id, invoice_id, request_id, file_name, file_sha256, row_count,
    recognized_count, new_count, changed_count, missing_count
  ) values (
    p_workspace_id, v_inv.id, p_request_id, left(p_file_name, 200), p_file_sha256,
    coalesce((v_counts ->> 'rows')::integer, 0),
    coalesce((v_counts ->> 'recognized')::integer, 0),
    coalesce((v_counts ->> 'new')::integer, 0),
    coalesce((v_counts ->> 'changed')::integer, 0),
    coalesce((v_counts ->> 'missing')::integer, 0)
  ) returning id into v_import_id;

  update public.finance_invoice_items
    set status = 'active', last_import_id = v_import_id, review_note = null
    where workspace_id = p_workspace_id and invoice_id = v_inv.id
      and id in (select (jsonb_array_elements_text(coalesce(p_plan -> 'recognize', '[]'::jsonb)))::uuid);

  -- Atualização de data/valor em DUAS fases: (1) move os itens para índices
  -- temporários altos; (2) grava data, valor e o occurrence_index livre do plano.
  update public.finance_invoice_items
    set occurrence_index = 1000000 + occurrence_index
    where workspace_id = p_workspace_id and invoice_id = v_inv.id
      and id in (select u.id from jsonb_to_recordset(coalesce(p_plan -> 'update', '[]'::jsonb)) as u(id uuid));

  update public.finance_invoice_items it
    set purchase_date = u.purchase_date, amount_cents = u.amount_cents,
        occurrence_index = coalesce(u.occurrence_index, it.occurrence_index - 1000000),
        status = 'active', last_import_id = v_import_id, review_note = null
    from jsonb_to_recordset(coalesce(p_plan -> 'update', '[]'::jsonb))
      as u(id uuid, purchase_date date, amount_cents bigint, occurrence_index integer)
    where it.id = u.id and it.workspace_id = p_workspace_id and it.invoice_id = v_inv.id;

  insert into public.finance_invoice_items (
    workspace_id, invoice_id, first_import_id, last_import_id, purchase_date, description,
    normalized_description, amount_cents, kind, occurrence_index, installment_no,
    installment_total, base_description, commitment_id
  )
  select p_workspace_id, v_inv.id, v_import_id, v_import_id, n.purchase_date, n.description,
         n.normalized_description, n.amount_cents, n.kind, n.occurrence_index, n.installment_no,
         n.installment_total, n.base_description, n.commitment_id
  from jsonb_to_recordset(coalesce(p_plan -> 'insert', '[]'::jsonb)) as n(
    purchase_date date, description text, normalized_description text, amount_cents bigint,
    kind text, occurrence_index integer, installment_no integer, installment_total integer,
    base_description text, commitment_id uuid
  );

  update public.finance_invoice_items
    set status = 'missing', review_note = 'Ausente da última importação'
    where workspace_id = p_workspace_id and invoice_id = v_inv.id
      and id in (select (jsonb_array_elements_text(coalesce(p_plan -> 'missing', '[]'::jsonb)))::uuid);

  update public.finance_invoice_items
    set status = 'removed', review_note = 'Removido na conciliação'
    where workspace_id = p_workspace_id and invoice_id = v_inv.id
      and id in (select (jsonb_array_elements_text(coalesce(p_plan -> 'remove', '[]'::jsonb)))::uuid);

  update public.finance_invoice_items it
    set commitment_id = l.commitment_id
    from jsonb_to_recordset(coalesce(p_plan -> 'link', '[]'::jsonb)) as l(item_id uuid, commitment_id uuid)
    where it.id = l.item_id and it.workspace_id = p_workspace_id and it.invoice_id = v_inv.id;

  update public.finance_card_invoices
    set status = 'paid', paid_at = coalesce(paid_at, now())
    where workspace_id = p_workspace_id and card = p_card and status <> 'paid'
      and id in (select (jsonb_array_elements_text(coalesce(p_plan -> 'pay_invoice_ids', '[]'::jsonb)))::uuid);

  update public.finance_card_invoices
    set imported_amount_cents = (
          select sum(amount_cents) from public.finance_invoice_items
          where workspace_id = p_workspace_id and invoice_id = v_inv.id
            and status in ('active', 'missing') and kind <> 'payment'
        ),
        due_date = coalesce(p_due_date, due_date),
        status = case
          when status = 'paid' then status
          else coalesce(p_new_status, status)
        end,
        last_imported_at = now(),
        rev = rev + 1
    where id = v_inv.id
    returning * into v_inv;

  return query select v_inv.id, false, v_inv.rev;
end;
$$;

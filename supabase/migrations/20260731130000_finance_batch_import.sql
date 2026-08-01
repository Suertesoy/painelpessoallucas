-- =============================================================================
-- Migration: Finanças — importação em lote, origem automática, caixa separado
-- =============================================================================
-- Aditiva sobre `20260731120000_finance.sql` (já aplicada em produção — não
-- editada). Cobre a simplificação do fluxo de importação:
--
-- 1. `finance_sources` ganha `provider` (chave estável de resolução
--    automática da origem — nunca o nome de exibição) e `status`
--    (`active`/`legacy`): as três origens antigas vinculadas a pessoa
--    (Lucas/Matheus) são marcadas `legacy` aqui mesmo para workspaces que já
--    as tinham antes desta migration — preservadas, nunca apagadas, apenas
--    deixam de ser usadas pelo novo fluxo de importação automática.
--
-- 2. `finance_import_rows`/`finance_transactions` ganham `source_amount_cents`
--    (valor bruto antes da normalização de sinal do perfil, ex.: fatura de
--    cartão onde compra vem positiva) — só para auditoria, nunca a linha
--    bruta inteira.
--
-- 3. `finance_monthly_records` ganha `lucas_available_cash_cents` e
--    `matheus_available_cash_cents`: o total pré-existente
--    (`available_cash_cents`) nunca é redistribuído por esta migration —
--    os dois novos campos começam em zero (default), e a aplicação trata
--    "total > 0 com os dois campos zerados" como "ainda não distribuído",
--    preservando o valor até a próxima edição explícita do usuário.
--
-- Nenhuma tabela nova: RLS e GRANT das tabelas existentes já cobrem as
-- colunas novas (GRANT do Postgres é por tabela, não por coluna, quando não
-- há lista de colunas explícita — não há uma aqui). `anon` continua sem
-- nenhum privilégio em nenhuma tabela `finance_*`.
-- =============================================================================

-- =============================================================================
-- FINANCE_SOURCES — provider (chave estável) + status (active/legacy)
-- =============================================================================
alter table public.finance_sources
  add column provider text check (provider in ('nubank', 'c6', 'generic'));

alter table public.finance_sources
  add column status text not null default 'active' check (status in ('active', 'legacy'));

-- Backfill: origens antigas vinculadas a pessoa, já existentes antes desta
-- migration (se este workspace já tiver rodado `ensureFinanceDefaults`),
-- viram `legacy` — preservadas, nunca apagadas, só deixam de ser usadas pelo
-- novo fluxo automático de importação (seção 6 do pedido).
update public.finance_sources
set status = 'legacy'
where name in ('Cartão Nubank Lucas', 'Cartão C6 Lucas', 'Cartão Nubank Matheus');

create index finance_sources_workspace_status_idx on public.finance_sources (workspace_id, status);

-- =============================================================================
-- FINANCE_IMPORT_ROWS / FINANCE_TRANSACTIONS — auditoria do valor bruto
-- =============================================================================
alter table public.finance_import_rows
  add column source_amount_cents integer;

alter table public.finance_transactions
  add column source_amount_cents integer;

-- =============================================================================
-- FINANCE_MONTHLY_RECORDS — disponível separado por pessoa
-- =============================================================================
alter table public.finance_monthly_records
  add column lucas_available_cash_cents integer not null default 0 check (lucas_available_cash_cents >= 0);

alter table public.finance_monthly_records
  add column matheus_available_cash_cents integer not null default 0 check (matheus_available_cash_cents >= 0);

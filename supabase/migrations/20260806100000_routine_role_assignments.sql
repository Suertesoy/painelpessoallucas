-- =============================================================================
-- Migration: Atribuição de projeto aos papéis da rotina diária (Home — Fase 1)
-- =============================================================================
-- A rotina diária em si (horários, papéis, blocos) NÃO é dado — é uma
-- constante de código em src/modules/routine/domain/routine-engine.ts. O que
-- precisa persistir é só QUAL projeto ocupa cada papel reutilizável
-- ("Projeto principal" e "Frente secundária"), para poder trocar sem
-- deploy. Duas colunas nulas em workspace_settings (mesmo padrão já usado
-- para shopping_whatsapp_number): nenhuma tabela nova, nenhum privilégio
-- adicional a conceder (privilégio é por tabela, não por coluna), nenhuma
-- mudança de RLS/realtime
-- — workspace_settings já tem tudo isso desde 20260717120000_digest_settings.sql
-- e 20260730100000_realtime_sync.sql.
-- =============================================================================

alter table public.workspace_settings
  add column routine_primary_project_id uuid references public.projects (id) on delete set null,
  add column routine_secondary_project_id uuid references public.projects (id) on delete set null;

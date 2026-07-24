-- =============================================================================
-- Migration: Captura por áudio (Fase 3 — Etapa 1)
-- =============================================================================
-- Menor alteração possível para suportar a nova origem "captura por áudio":
--   1. items.source ganha 'audio_capture' (não existia um valor neutro para
--      distinguir uma captura por voz de uma captura por texto/quick_capture).
--   2. items.audio_duration_seconds guarda a duração da gravação — a data da
--      captura já é coberta pelo created_at existente, não precisa de coluna
--      nova.
--   3. ai_runs.item_id referencia o item triado. As execuções de IA já
--      existentes (plan_import) se vinculam por source_document_id/
--      execution_plan_id; a triagem de captura por áudio não gera nenhum dos
--      dois — seu sujeito é o item da captura.
-- Nenhuma tabela é apagada, nenhuma policy de RLS é alterada — os GRANTs de
-- authenticated em items/ai_runs já cobrem as colunas novas (privilégio é
-- por tabela, não por coluna).
-- =============================================================================

alter table public.items
  drop constraint items_source_check;

alter table public.items
  add constraint items_source_check
  check (source in ('quick_capture', 'manual', 'import', 'ai', 'integration', 'mcp', 'automation', 'audio_capture'));

alter table public.items
  add column audio_duration_seconds integer check (audio_duration_seconds > 0);

alter table public.ai_runs
  add column item_id uuid references public.items (id) on delete set null;

create index ai_runs_item_idx on public.ai_runs (item_id) where item_id is not null;

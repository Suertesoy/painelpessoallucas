-- =============================================================================
-- Captura inteligente: item de compra como destino real da triagem
-- =============================================================================
-- Os tipos históricos (idea/insight/decision/reference/reminder) permanecem
-- válidos para preservar registros existentes. Novas capturas usam apenas
-- task, note e shopping_item; compromissos com horário continuam representados
-- pelo fluxo de Calendar, e não por um item artificial.
-- =============================================================================

alter table public.items
  drop constraint items_type_check;

alter table public.items
  add constraint items_type_check
  check (
    type in (
      'task',
      'shopping_item',
      'idea',
      'insight',
      'decision',
      'reminder',
      'reference',
      'note'
    )
  );

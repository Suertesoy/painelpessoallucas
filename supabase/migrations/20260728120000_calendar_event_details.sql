-- =============================================================================
-- Migration: Detalhes normalizados do evento em calendar_event_links
-- =============================================================================
-- calendar_event_links hoje só guarda os IDs do Google (calendar_id/event_id)
-- + etag/status de sync — a agenda interna não tem como renderizar o evento
-- sem chamar o Google a cada carregamento. Esta migration adiciona os campos
-- necessários para a agenda interna ler uma representação normalizada direto
-- do banco (RLS já existente cobre select/insert/update por workspace).
--
-- created_by_panel existe desde já (default true) para toda linha atual —
-- é o marcador que separará, na fase futura de sincronização bidirecional,
-- eventos criados pelo painel de eventos lidos diretamente do Google.
-- =============================================================================

alter table public.calendar_event_links
  add column title text,
  add column start_at timestamptz,
  add column end_at timestamptz,
  add column time_zone text not null default 'America/Sao_Paulo',
  add column location text,
  add column location_place_id text,
  add column location_lat double precision,
  add column location_lng double precision,
  add column modality text not null default 'undetermined'
    check (modality in ('in_person', 'online', 'undetermined')),
  add column meeting_link text,
  add column ical_uid text,
  add column html_link text,
  add column google_status text,
  add column color_id text,
  add column reminders_minutes integer[] not null default '{}',
  add column created_by_panel boolean not null default true;

create index calendar_event_links_range_idx on public.calendar_event_links (workspace_id, start_at, end_at)
  where sync_status <> 'deleted';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSessionContext } from '@/platform/supabase/session';
import { getSupabaseAdminClient } from '@/platform/supabase/admin-client';
import { getCalendarAccount } from '@/platform/integrations/calendar-sync';
import { getValidAccessToken, GoogleTokenRevokedError } from '@/platform/integrations/google-client';
import {
  ensureAppCalendar,
  upsertItemEvent,
  GoogleCalendarRequestError,
  type GoogleEvent,
} from '@/platform/integrations/google-calendar';
import { checkTriageFreshness, STALE_ANALYSIS_MESSAGE } from '@/platform/ai/triage-freshness';
import { validateEventInterval, computeActiveReminders, isValidMeetingLink } from '@/lib/calendar-event-shared';

/**
 * POST /api/audio/confirm-calendar-event
 * Cria (ou atualiza, se já existir um vínculo para esta captura — retry
 * idempotente), no calendário "Painel Lucas", o evento aprovado
 * explicitamente na revisão de uma captura por áudio.
 *
 * Convites NÃO são enviados nesta primeira versão: participantes mencionados
 * na transcrição ficam só como sugestão (visível na revisão e preservada em
 * ai_runs), nunca viram convite automático do Google.
 *
 * Falha aqui nunca apaga a captura nem qualquer tarefa relacionada — esta
 * rota só grava em calendar_event_links, uma tabela separada.
 */

const ModalitySchema = z.enum(['in_person', 'online', 'undetermined']);

const BodySchema = z.object({
  itemId: z.string().uuid(),
  aiRunId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  modality: ModalitySchema.default('undetermined'),
  location: z.string().optional(),
  locationPlaceId: z.string().optional(),
  locationLat: z.number().optional(),
  locationLng: z.number().optional(),
  meetingLink: z.string().optional(),
  reminderMinutes: z.array(z.number().int().positive()).max(5).default([1440, 60]),
});

type ErrorCategory =
  | 'unauthenticated'
  | 'invalid_request'
  | 'invalid_interval'
  | 'calendar_not_connected'
  | 'calendar_error'
  | 'stale_analysis';

function errorResponse(status: number, errorCategory: ErrorCategory, message: string) {
  return NextResponse.json({ error: message, errorCategory }, { status });
}

interface ExistingLinkRow {
  google_calendar_id: string;
  google_event_id: string;
}

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return errorResponse(401, 'unauthenticated', 'Sessão expirada. Faça login novamente.');
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return errorResponse(400, 'invalid_request', 'Não foi possível confirmar: dados do evento incompletos.');
  }

  // Intervalo inválido nunca chega ao Google — verificado antes de qualquer
  // outra coisa, inclusive antes de tocar o banco.
  const interval = validateEventInterval(body.startAt, body.endAt);
  if (!interval.valid) {
    return errorResponse(400, 'invalid_interval', interval.message ?? 'Intervalo inválido.');
  }

  if (body.modality === 'online' && body.meetingLink && !isValidMeetingLink(body.meetingLink)) {
    return errorResponse(400, 'invalid_request', 'O link da reunião precisa ser um endereço https:// válido.');
  }

  // Captura sob RLS: só encontra se pertencer ao workspace do usuário.
  const { data: item, error: itemError } = await session.supabase
    .from('items')
    .select('id, content, title')
    .eq('id', body.itemId)
    .is('deleted_at', null)
    .maybeSingle();
  if (itemError || !item) {
    return errorResponse(404, 'invalid_request', 'Captura não encontrada.');
  }

  const currentContent = (item.content as string | null) ?? (item.title as string | null) ?? '';
  const freshness = await checkTriageFreshness(session.supabase, {
    aiRunId: body.aiRunId,
    itemId: body.itemId,
    workspaceId: session.workspaceId,
    currentContent,
  });
  if (!freshness.fresh) {
    if (freshness.reason === 'stale') {
      return errorResponse(409, 'stale_analysis', STALE_ANALYSIS_MESSAGE);
    }
    return errorResponse(404, 'invalid_request', 'Análise não encontrada. Analise novamente antes de confirmar.');
  }

  const account = await getCalendarAccount(session.supabase, session.workspaceId);
  if (!account) {
    return errorResponse(
      409,
      'calendar_not_connected',
      'Google Calendar não conectado. Conecte em Configurações → Integrações e tente de novo.'
    );
  }

  const admin = getSupabaseAdminClient();
  const { minutes: reminderMinutes, notice: remindersNotice } = computeActiveReminders(
    body.startAt,
    body.reminderMinutes
  );

  const location =
    body.modality === 'in_person' ? (body.location ?? undefined) : body.modality === 'online' ? body.meetingLink : undefined;

  let event: GoogleEvent;
  let calendarId: string;
  try {
    const accessToken = await getValidAccessToken(admin, account.id);
    calendarId = await ensureAppCalendar(admin, account, accessToken);

    // Vínculo pré-existente (retry, ou item já sincronizado antes) vira
    // atualização (PUT) em vez de criar um segundo evento no Google.
    const { data: existingLink } = await admin
      .from('calendar_event_links')
      .select('google_calendar_id, google_event_id')
      .eq('item_id', body.itemId)
      .maybeSingle();
    const existing = existingLink as ExistingLinkRow | null;

    event = await upsertItemEvent(
      accessToken,
      calendarId,
      {
        itemId: body.itemId,
        title: body.title,
        description: body.description,
        startIso: body.startAt,
        endIso: body.endAt,
        location,
        reminderMinutes,
      },
      existing?.google_calendar_id === calendarId ? existing.google_event_id : undefined
    );
  } catch (e) {
    if (e instanceof GoogleTokenRevokedError) {
      return errorResponse(
        409,
        'calendar_not_connected',
        'A conexão com o Google Calendar expirou. Reconecte em Configurações → Integrações.'
      );
    }
    // Nunca repassar a mensagem bruta do Google (pode conter "HTTP 4xx/5xx",
    // JSON de erro, etc.) — só um resumo em português para diagnóstico interno.
    const status = e instanceof GoogleCalendarRequestError ? e.status : 'desconhecido';
    console.error('Falha ao criar evento no Google Calendar', status, e);
    return errorResponse(
      502,
      'calendar_error',
      'Não foi possível criar o evento agora. Sua captura continua salva — tente novamente.'
    );
  }

  const linkPayload = {
    workspace_id: session.workspaceId,
    item_id: body.itemId,
    google_calendar_id: calendarId,
    google_event_id: event.id,
    etag: event.etag,
    title: body.title,
    start_at: body.startAt,
    end_at: body.endAt,
    time_zone: 'America/Sao_Paulo',
    location: location ?? null,
    location_place_id: body.modality === 'in_person' ? (body.locationPlaceId ?? null) : null,
    location_lat: body.modality === 'in_person' ? (body.locationLat ?? null) : null,
    location_lng: body.modality === 'in_person' ? (body.locationLng ?? null) : null,
    modality: body.modality,
    meeting_link: body.modality === 'online' ? (body.meetingLink ?? null) : null,
    ical_uid: event.iCalUID ?? null,
    html_link: event.htmlLink ?? null,
    google_status: event.status ?? null,
    color_id: event.colorId ?? null,
    reminders_minutes: reminderMinutes,
    created_by_panel: true,
    sync_status: 'synced',
    last_synced_at: new Date().toISOString(),
    last_error: null,
  };

  const linked = await tryPersistLink(admin, linkPayload);

  const normalized = {
    googleEventId: event.id,
    googleCalendarId: calendarId,
    htmlLink: event.htmlLink ?? null,
    title: body.title,
    startAt: body.startAt,
    endAt: body.endAt,
    timeZone: 'America/Sao_Paulo',
    location: location ?? null,
    meetingLink: body.modality === 'online' ? (body.meetingLink ?? null) : null,
    modality: body.modality,
    reminders: reminderMinutes,
    remindersNotice,
  };

  if (!linked.ok) {
    console.error('Evento criado no Google, mas falhou ao persistir calendar_event_links', linked.error);
    return NextResponse.json({
      status: 'created_link_pending',
      message: 'O evento foi criado no Google Agenda, mas não foi possível atualizar a agenda do painel agora.',
      ...normalized,
    });
  }

  return NextResponse.json({ status: 'created', ...normalized });
}

async function tryPersistLink(
  admin: SupabaseClient,
  payload: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin.from('calendar_event_links').upsert(payload, { onConflict: 'item_id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

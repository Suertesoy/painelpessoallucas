import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/platform/supabase/session';
import { getSupabaseAdminClient } from '@/platform/supabase/admin-client';
import { checkTriageFreshness, STALE_ANALYSIS_MESSAGE } from '@/platform/ai/triage-freshness';

/**
 * POST /api/audio/link-calendar-event
 * Persiste (ou tenta novamente persistir) o vínculo de um evento que JÁ FOI
 * criado no Google — nunca chama o Google. Existe só para o caso em que
 * /api/audio/confirm-calendar-event criou o evento com sucesso mas falhou ao
 * gravar calendar_event_links: em vez de repetir a criação inteira (o que
 * duplicaria o evento externo), o cliente reenvia os dados já conhecidos do
 * evento (retornados pela primeira chamada) e esta rota só grava o vínculo.
 */

const ModalitySchema = z.enum(['in_person', 'online', 'undetermined']);

const BodySchema = z.object({
  itemId: z.string().uuid(),
  aiRunId: z.string().uuid(),
  googleCalendarId: z.string().min(1),
  googleEventId: z.string().min(1),
  title: z.string().min(1),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  timeZone: z.string().min(1),
  modality: ModalitySchema,
  location: z.string().nullable().optional(),
  meetingLink: z.string().nullable().optional(),
  htmlLink: z.string().nullable().optional(),
  reminders: z.array(z.number().int().positive()).max(5).optional(),
});

type ErrorCategory = 'unauthenticated' | 'invalid_request' | 'stale_analysis' | 'link_failed';

function errorResponse(status: number, errorCategory: ErrorCategory, message: string) {
  return NextResponse.json({ error: message, errorCategory }, { status });
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
    return errorResponse(400, 'invalid_request', 'Não foi possível atualizar a agenda: dados incompletos.');
  }

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

  const admin = getSupabaseAdminClient();
  const { error } = await admin.from('calendar_event_links').upsert(
    {
      workspace_id: session.workspaceId,
      item_id: body.itemId,
      google_calendar_id: body.googleCalendarId,
      google_event_id: body.googleEventId,
      title: body.title,
      start_at: body.startAt,
      end_at: body.endAt,
      time_zone: body.timeZone,
      location: body.location ?? null,
      meeting_link: body.meetingLink ?? null,
      modality: body.modality,
      html_link: body.htmlLink ?? null,
      reminders_minutes: body.reminders ?? [],
      created_by_panel: true,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: 'item_id' }
  );

  if (error) {
    console.error('Retry de vínculo do evento falhou novamente', error.message);
    return errorResponse(
      502,
      'link_failed',
      'Ainda não foi possível atualizar a agenda do painel. O evento já criado no Google Agenda continua válido — tente novamente em instantes.'
    );
  }

  return NextResponse.json({ status: 'linked' });
}

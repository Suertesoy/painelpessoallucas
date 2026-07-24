import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/platform/supabase/session';
import { getSupabaseAdminClient } from '@/platform/supabase/admin-client';
import { getCalendarAccount } from '@/platform/integrations/calendar-sync';
import { getValidAccessToken, GoogleTokenRevokedError } from '@/platform/integrations/google-client';
import { ensureAppCalendar, upsertItemEvent } from '@/platform/integrations/google-calendar';

/**
 * POST /api/audio/confirm-calendar-event
 * Cria, no calendário "Painel Lucas", o evento aprovado explicitamente na
 * revisão de uma captura por áudio. Reaproveita a integração Google
 * existente (mesmo OAuth, mesmos scopes, mesmas funções de
 * platform/integrations) — nenhum fluxo novo, nenhum escopo novo.
 *
 * Convites NÃO são enviados nesta primeira versão: participantes mencionados
 * na transcrição ficam só como sugestão (visível na revisão e preservada em
 * ai_runs), nunca viram convite automático do Google.
 *
 * Falha aqui nunca apaga a captura nem qualquer tarefa relacionada — esta
 * rota só grava em calendar_event_links, uma tabela separada.
 */

const BodySchema = z.object({
  itemId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  location: z.string().optional(),
});

type ErrorCategory = 'unauthenticated' | 'invalid_request' | 'calendar_not_connected' | 'calendar_error';

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
    return errorResponse(400, 'invalid_request', 'Não foi possível confirmar: data/horário incompletos.');
  }

  // Captura sob RLS: só encontra se pertencer ao workspace do usuário.
  const { data: item, error: itemError } = await session.supabase
    .from('items')
    .select('id')
    .eq('id', body.itemId)
    .is('deleted_at', null)
    .maybeSingle();
  if (itemError || !item) {
    return errorResponse(404, 'invalid_request', 'Captura não encontrada.');
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
  try {
    const accessToken = await getValidAccessToken(admin, account.id);
    const calendarId = await ensureAppCalendar(admin, account, accessToken);

    const description = body.location
      ? [body.description, `Local: ${body.location}`].filter(Boolean).join('\n\n')
      : body.description;

    const event = await upsertItemEvent(accessToken, calendarId, {
      itemId: body.itemId,
      title: body.title,
      description,
      startIso: body.startAt,
      endIso: body.endAt,
      withReminder: true,
    });

    const { error: linkError } = await admin.from('calendar_event_links').upsert(
      {
        workspace_id: session.workspaceId,
        item_id: body.itemId,
        google_calendar_id: calendarId,
        google_event_id: event.id,
        etag: event.etag,
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: 'item_id' }
    );
    if (linkError) {
      throw new Error(`Falha ao registrar o vínculo do evento: ${linkError.message}`);
    }

    return NextResponse.json({ status: 'created', googleEventId: event.id, googleCalendarId: calendarId });
  } catch (e) {
    const revoked = e instanceof GoogleTokenRevokedError;
    const message = e instanceof Error ? e.message : 'Erro desconhecido ao criar o evento';

    // Nenhuma escrita aqui: a falha fica só na resposta HTTP. O item e
    // qualquer tarefa relacionada nunca são tocados por esta rota — só
    // calendar_event_links seria alterada, e evitamos gravar um registro de
    // falha parcial para não arriscar colidir com a constraint única de
    // (google_calendar_id, google_event_id) entre capturas diferentes.
    return errorResponse(
      revoked ? 409 : 502,
      revoked ? 'calendar_not_connected' : 'calendar_error',
      revoked
        ? 'A conexão com o Google Calendar expirou. Reconecte em Configurações → Integrações.'
        : `Não foi possível criar o evento agora (${message}). Sua captura continua salva — tente novamente.`
    );
  }
}

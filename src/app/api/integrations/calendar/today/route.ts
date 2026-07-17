import { NextResponse } from 'next/server';
import { getSessionContext } from '@/platform/supabase/session';
import { getSupabaseAdminClient } from '@/platform/supabase/admin-client';
import { getCalendarAccount } from '@/platform/integrations/calendar-sync';
import { getValidAccessToken, GoogleTokenRevokedError } from '@/platform/integrations/google-client';
import {
  ensureAppCalendar,
  queryFreeBusy,
  listAppCalendarEvents,
} from '@/platform/integrations/google-calendar';
import { zonedDateTimeToUtc } from '@/modules/plans/domain/recurrence-engine';

/**
 * GET /api/integrations/calendar/today?date=YYYY-MM-DD
 * Compromissos do dia para a tela Hoje:
 * - busy: blocos ocupados do calendário principal (freebusy — sem títulos,
 *   consequência dos scopes mínimos)
 * - events: eventos do calendário "Painel Lucas" (criados pela app)
 */
export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Data inválida' }, { status: 400 });
  }

  const account = await getCalendarAccount(session.supabase, session.workspaceId);
  if (!account) {
    return NextResponse.json({ connected: false, busy: [], events: [] });
  }

  const timeMin = zonedDateTimeToUtc(date, '00:00', 'America/Sao_Paulo').toISOString();
  const timeMax = zonedDateTimeToUtc(date, '23:59', 'America/Sao_Paulo').toISOString();

  try {
    const admin = getSupabaseAdminClient();
    const accessToken = await getValidAccessToken(admin, account.id);
    const calendarId = await ensureAppCalendar(admin, account, accessToken);

    const [freeBusy, events] = await Promise.all([
      queryFreeBusy(accessToken, ['primary'], timeMin, timeMax),
      listAppCalendarEvents(accessToken, calendarId, timeMin, timeMax),
    ]);

    return NextResponse.json({
      connected: true,
      busy: freeBusy['primary'] ?? [],
      events,
    });
  } catch (e) {
    if (e instanceof GoogleTokenRevokedError) {
      return NextResponse.json({ connected: false, revoked: true, busy: [], events: [] });
    }
    const message = e instanceof Error ? e.message : 'erro desconhecido';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

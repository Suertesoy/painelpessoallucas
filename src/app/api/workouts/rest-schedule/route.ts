export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/platform/supabase/session';
import { getSupabaseAdminClient } from '@/platform/supabase/admin-client';
import { checkRateLimit } from '@/platform/ai/rate-limit';
import { isVapidConfigured } from '@/platform/push/vapid';
import { getQStashClient, isQStashConfigured, restCallbackUrl } from '@/platform/qstash/client';
import { athleteLinkFor, RestAlertInfraError, scheduleRestAlert } from '@/platform/workouts/rest-alert';

const BodySchema = z.object({ sessionId: z.string().uuid() }).strict();

const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;

function serverReady(): boolean {
  return isQStashConfigured() && isVapidConfigured() && restCallbackUrl() !== null;
}

/**
 * GET /api/workouts/rest-schedule?athleteId= — o que a interface precisa
 * para orientar o usuário: o servidor está pronto para avisar? Os avisos
 * deste atleta vão para mim, para outra conta ou para ninguém ainda?
 */
export async function GET(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const athleteId = z.string().uuid().safeParse(new URL(request.url).searchParams.get('athleteId'));
  if (!athleteId.success) return NextResponse.json({ error: 'Atleta inválido.' }, { status: 400 });

  try {
    const athlete = await athleteLinkFor(ctx.supabase, athleteId.data, ctx.user.id);
    if (!athlete) return NextResponse.json({ error: 'Atleta não encontrado.' }, { status: 404 });
    return NextResponse.json({ ready: serverReady(), athlete });
  } catch {
    return NextResponse.json({ error: 'Não foi possível verificar os avisos de descanso.' }, { status: 500 });
  }
}

/**
 * POST /api/workouts/rest-schedule { sessionId } — agenda o aviso de fim do
 * descanso ATUAL da sessão. O corpo só identifica a sessão: prazo, geração e
 * destinatário são lidos do banco (sessão via RLS do usuário logado).
 * Idempotente: repetir para o mesmo descanso não cria outra mensagem.
 */
export async function POST(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 });

  if (!checkRateLimit(`workout-rest-schedule:${ctx.user.id}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json({ error: 'Muitos agendamentos em pouco tempo.' }, { status: 429 });
  }

  const callbackUrl = restCallbackUrl();
  if (!serverReady() || !callbackUrl) {
    // Falha explícita (não silenciosa): o app mostra o aviso de configuração.
    return NextResponse.json({ error: 'Avisos de descanso não configurados no servidor.', reason: 'not_configured' }, { status: 503 });
  }

  try {
    const qstash = getQStashClient();
    const result = await scheduleRestAlert(
      {
        db: ctx.supabase,
        admin: getSupabaseAdminClient(),
        publish: (req) => qstash.publishJSON(req),
        callbackUrl,
        nowMs: Date.now(),
      },
      parsed.data.sessionId
    );
    return NextResponse.json(result);
  } catch (e) {
    const where = e instanceof RestAlertInfraError ? 'banco' : 'QStash';
    console.error(`Falha ao agendar aviso de descanso (${where}).`);
    return NextResponse.json({ error: 'Não foi possível agendar o aviso de descanso.' }, { status: 502 });
  }
}

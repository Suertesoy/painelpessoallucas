import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/platform/supabase/session';
import { getSupabaseAdminClient } from '@/platform/supabase/admin-client';
import { sendDigest } from '@/platform/integrations/digest-dispatch';

/**
 * POST /api/integrations/gmail/send-digest { kind: 'daily' | 'weekly' }
 * Envio manual (teste) do resumo para o próprio usuário.
 */
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = z
    .object({ kind: z.enum(['daily', 'weekly']) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tipo de resumo inválido' }, { status: 400 });
  }

  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());

  try {
    const result = await sendDigest(
      getSupabaseAdminClient(),
      session.supabase,
      session.workspaceId,
      parsed.data.kind,
      localDate,
      { manual: true }
    );
    if (!result.sent) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'erro desconhecido';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

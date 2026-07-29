import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/platform/supabase/session';
import { getSupabaseAdminClient } from '@/platform/supabase/admin-client';
import { disableSubscription } from '@/platform/push/push-dispatch';

const BodySchema = z.object({ id: z.string().uuid() });

/** POST /api/push/unsubscribe { id } — desativa a assinatura do dispositivo atual. */
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Identificador de assinatura inválido.' }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { data: existing } = await admin
    .from('push_subscriptions')
    .select('id')
    .eq('id', parsed.data.id)
    .eq('workspace_id', session.workspaceId)
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Assinatura não encontrada.' }, { status: 404 });

  await disableSubscription(admin, existing.id);
  return NextResponse.json({ ok: true });
}

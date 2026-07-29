import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/platform/supabase/session';
import { getSupabaseAdminClient } from '@/platform/supabase/admin-client';
import { disableSubscription } from '@/platform/push/push-dispatch';

const IdSchema = z.string().uuid();

/**
 * POST /api/push/devices/[id]/revoke — desativa um dispositivo antigo a
 * partir da lista em Configurações. Só o dono da assinatura (mesmo
 * user_id e workspace) pode revogá-la — nunca aceita revogar a assinatura
 * de outro usuário, mesmo dentro do mesmo workspace.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { id } = await params;
  if (!IdSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Identificador de dispositivo inválido.' }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { data: existing } = await admin
    .from('push_subscriptions')
    .select('id')
    .eq('id', id)
    .eq('workspace_id', session.workspaceId)
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Dispositivo não encontrado.' }, { status: 404 });

  await disableSubscription(admin, existing.id);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { getSessionContext } from '@/platform/supabase/session';
import { getSupabaseAdminClient } from '@/platform/supabase/admin-client';

/**
 * GET /api/push/devices — lista sanitizada dos dispositivos do usuário
 * (nunca endpoint/p256dh/auth). Escopo por user_id: um membro do workspace
 * nunca vê (nem pode gerenciar) a assinatura de outro membro.
 */
export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from('push_subscriptions')
    .select('id, device_name, platform, is_active, last_seen_at, created_at')
    .eq('workspace_id', session.workspaceId)
    .eq('user_id', session.user.id)
    .order('last_seen_at', { ascending: false, nullsFirst: false });

  const devices = (data ?? []).map((row) => ({
    id: row.id,
    deviceName: row.device_name,
    platform: row.platform,
    isActive: row.is_active,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
  }));

  return NextResponse.json({ devices });
}

import { NextResponse } from 'next/server';
import { getSessionContext } from '@/platform/supabase/session';
import { getSupabaseAdminClient } from '@/platform/supabase/admin-client';
import { SubscribeRequestSchema } from '@/platform/push/push-preferences.schema';
import { isValidPushEndpoint } from '@/platform/push/endpoint-validation';
import { guessDeviceName } from '@/platform/push/device-info';

/**
 * POST /api/push/subscribe — registra ou reconcilia a assinatura do
 * dispositivo atual. `push_subscriptions` não tem policy de RLS para
 * "authenticated" (mesmo padrão de integration_tokens): esta rota usa o
 * cliente admin, mas só depois de validar a sessão — nunca aceita
 * workspace_id/user_id vindos do corpo da requisição.
 *
 * Reconciliação: se o endpoint já existir (mesmo dispositivo), atualiza
 * last_seen_at/chaves sem tocar nas preferências já configuradas (toggles
 * continuam como o usuário deixou — nunca reativa nada silenciosamente).
 */
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = SubscribeRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 400 });
  }

  const { subscription, deviceName, platform, timezone } = parsed.data;
  if (!isValidPushEndpoint(subscription.endpoint)) {
    return NextResponse.json({ error: 'Endpoint de assinatura inválido.' }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('push_subscriptions')
    .upsert(
      {
        workspace_id: session.workspaceId,
        user_id: session.user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth_key: subscription.keys.auth,
        device_name: deviceName ?? guessDeviceName(),
        platform: platform ?? 'other',
        timezone: timezone ?? 'America/Sao_Paulo',
        is_active: true,
        disabled_at: null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    )
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Não foi possível registrar a assinatura.' }, { status: 500 });
  }

  return NextResponse.json({ subscriptionId: data.id });
}

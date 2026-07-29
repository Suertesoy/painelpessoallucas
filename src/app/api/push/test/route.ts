export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/platform/supabase/session';
import { getSupabaseAdminClient } from '@/platform/supabase/admin-client';
import { checkRateLimit } from '@/platform/ai/rate-limit';
import { sendWebPush, WebPushDeliveryError, isVapidConfigured } from '@/platform/push/vapid';
import { disableSubscription } from '@/platform/push/push-dispatch';

const BodySchema = z.object({ id: z.string().uuid() });

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 5 * 60_000;

/**
 * POST /api/push/test { id } — envia uma notificação de teste SOMENTE ao
 * dispositivo atual (nunca a outros dispositivos do workspace). Não passa
 * pela outbox (`push_deliveries`) — é um envio direto e síncrono, sem
 * persistir em `notifications`. Limitado a 3 envios a cada 5 minutos por
 * usuário para evitar disparos repetidos acidentais.
 */
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Identificador de assinatura inválido.' }, { status: 400 });
  }

  if (!checkRateLimit(`push-test:${session.user.id}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json(
      { error: 'Muitos testes em pouco tempo. Aguarde alguns minutos e tente novamente.' },
      { status: 429 }
    );
  }

  if (!isVapidConfigured()) {
    return NextResponse.json(
      { error: 'Notificações push ainda não foram configuradas no servidor.' },
      { status: 503 }
    );
  }

  const admin = getSupabaseAdminClient();
  const { data: subscription } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('id', parsed.data.id)
    .eq('workspace_id', session.workspaceId)
    .eq('user_id', session.user.id)
    .eq('is_active', true)
    .is('disabled_at', null)
    .maybeSingle();

  if (!subscription) {
    return NextResponse.json({ error: 'Assinatura não encontrada ou desativada.' }, { status: 404 });
  }

  try {
    await sendWebPush(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_key } },
      { title: 'Painel Lucas', body: 'Notificação de teste — tudo funcionando neste dispositivo.', url: '/configuracoes', tag: 'push-test' }
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof WebPushDeliveryError && e.category === 'expired_subscription') {
      await disableSubscription(admin, subscription.id);
      return NextResponse.json(
        { error: 'Este dispositivo não está mais recebendo notificações. Ative novamente.' },
        { status: 410 }
      );
    }
    return NextResponse.json({ error: 'Não foi possível enviar a notificação de teste.' }, { status: 502 });
  }
}

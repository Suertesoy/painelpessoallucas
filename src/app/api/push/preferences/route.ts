import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/platform/supabase/session';
import { getSupabaseAdminClient } from '@/platform/supabase/admin-client';
import {
  UpdatePushPreferencesSchema,
  toPreferencesDTO,
  fromPreferencesPatch,
} from '@/platform/push/push-preferences.schema';

const IdSchema = z.string().uuid();

/**
 * GET/PUT /api/push/preferences?id=<subscriptionId> — preferências
 * sanitizadas do dispositivo atual (nunca endpoint/p256dh/auth). `id`
 * identifica a assinatura (devolvida por /api/push/subscribe); toda
 * operação exige que ela pertença ao usuário e workspace autenticados.
 */

async function loadOwnedSubscription(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  workspaceId: string,
  userId: string,
  id: string
) {
  const { data } = await admin
    .from('push_subscriptions')
    .select(
      'id, device_name, platform, task_reminders_enabled, daily_planning_enabled, daily_planning_time, weekly_review_enabled, weekly_review_day, weekly_review_time, capture_failure_enabled, show_details_enabled, timezone'
    )
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!IdSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Identificador de assinatura inválido.' }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const row = await loadOwnedSubscription(admin, session.workspaceId, session.user.id, id);
  if (!row) return NextResponse.json({ error: 'Assinatura não encontrada.' }, { status: 404 });

  // Reconciliação: o painel foi aberto com essa assinatura ativa.
  await admin.from('push_subscriptions').update({ last_seen_at: new Date().toISOString() }).eq('id', id);

  return NextResponse.json(toPreferencesDTO(row));
}

export async function PUT(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!IdSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Identificador de assinatura inválido.' }, { status: 400 });
  }

  const parsed = UpdatePushPreferencesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Preferências inválidas.' }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const existing = await loadOwnedSubscription(admin, session.workspaceId, session.user.id, id);
  if (!existing) return NextResponse.json({ error: 'Assinatura não encontrada.' }, { status: 404 });

  const patch = fromPreferencesPatch(parsed.data);
  const { data: updated, error } = await admin
    .from('push_subscriptions')
    .update(patch)
    .eq('id', id)
    .select(
      'device_name, platform, task_reminders_enabled, daily_planning_enabled, daily_planning_time, weekly_review_enabled, weekly_review_day, weekly_review_time, capture_failure_enabled, show_details_enabled, timezone'
    )
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: 'Não foi possível salvar as preferências.' }, { status: 500 });
  }

  return NextResponse.json(toPreferencesDTO(updated));
}

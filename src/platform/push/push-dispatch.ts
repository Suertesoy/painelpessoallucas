import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildNotificationContent, type PushCategory } from './push-content';
import { sendWebPush, WebPushDeliveryError } from './vapid';

/**
 * Serviço server-only de envio/outbox de Web Push.
 *
 * Fluxo (ver docs/ARCHITECTURE.md § Web Push):
 * 1. Uma ocorrência funcional (lembrete vencido, hora do aviso diário/semanal,
 *    falha de captura) cria ou localiza uma linha idempotente em
 *    `notifications` (dedup_key único por workspace).
 * 2. Uma entrega (`push_deliveries`) é criada para cada assinatura ativa
 *    elegível — nunca duas entregas para o mesmo par (notification,
 *    subscription).
 * 3. `dispatchPendingDeliveries` envia as entregas pendentes, marca sucesso,
 *    desativa assinaturas expiradas (404/410) e agenda nova tentativa para
 *    erros temporários (até PUSH_MAX_ATTEMPTS).
 */

export const PUSH_MAX_ATTEMPTS = 3;
const BACKOFF_MINUTES_BY_ATTEMPT: Record<number, number> = { 1: 5, 2: 15 };

interface SubscriptionRow {
  id: string;
  workspace_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  show_details_enabled: boolean;
}

/** Categoria → coluna de preferência correspondente em push_subscriptions. */
const PREFERENCE_COLUMN: Record<PushCategory, string> = {
  task_reminder: 'task_reminders_enabled',
  daily_planning: 'daily_planning_enabled',
  weekly_review: 'weekly_review_enabled',
  capture_failure: 'capture_failure_enabled',
};

interface NotificationParams {
  workspaceId: string;
  category: PushCategory;
  dedupKey: string;
  targetUrl: string;
  entityType?: string;
  entityId?: string;
  /** Só para task_reminder — nunca conteúdo de IA/transcrição/erro técnico. */
  itemTitle?: string;
}

/** Cria (ou localiza, se já existir) a linha idempotente em `notifications`. */
async function upsertNotification(
  admin: SupabaseClient,
  params: NotificationParams
): Promise<{ id: string } | null> {
  const generic = buildNotificationContent({ category: params.category, showDetails: false });

  const { data: inserted, error: insertError } = await admin
    .from('notifications')
    .insert({
      workspace_id: params.workspaceId,
      type: params.category,
      title: generic.title,
      body: generic.body,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      dedup_key: params.dedupKey,
      target_url: params.targetUrl,
      metadata: params.itemTitle ? { itemTitle: params.itemTitle.slice(0, 200) } : null,
    })
    .select('id')
    .maybeSingle();

  if (!insertError && inserted) return inserted;

  // 23505 = unique_violation: já existe uma notificação com essa dedup_key
  // neste workspace — busca a existente (idempotência real, garantida pelo
  // banco, não pela memória do processo).
  if (insertError?.code === '23505') {
    const { data: existing } = await admin
      .from('notifications')
      .select('id')
      .eq('workspace_id', params.workspaceId)
      .eq('dedup_key', params.dedupKey)
      .maybeSingle();
    return existing ?? null;
  }

  return null;
}

/** Cria uma entrega pendente (ignora conflito — já existe para este par). */
/** Retorna true quando a entrega foi realmente criada agora (false quando já
 * existia para este par notificação/assinatura — conflito 23505, ignorado). */
async function createDelivery(
  admin: SupabaseClient,
  notificationId: string,
  subscriptionId: string
): Promise<boolean> {
  const { error } = await admin.from('push_deliveries').insert({
    notification_id: notificationId,
    subscription_id: subscriptionId,
    status: 'pending',
  });
  if (!error) return true;
  if (error.code === '23505') return false;
  throw new Error(`Falha ao criar entrega push: ${error.message}`);
}

/**
 * Fluxo para categorias "workspace-wide" (lembrete de tarefa, falha de
 * captura): cria a notificação idempotente e uma entrega para CADA
 * assinatura ativa do workspace que habilitou aquela categoria.
 */
export async function createDeliveriesForWorkspace(
  admin: SupabaseClient,
  params: NotificationParams
): Promise<{ created: number }> {
  const notification = await upsertNotification(admin, params);
  if (!notification) return { created: 0 };

  const { data: subscriptions } = await admin
    .from('push_subscriptions')
    .select('id')
    .eq('workspace_id', params.workspaceId)
    .eq('is_active', true)
    .is('disabled_at', null)
    .eq(PREFERENCE_COLUMN[params.category], true);

  let created = 0;
  for (const sub of subscriptions ?? []) {
    if (await createDelivery(admin, notification.id, sub.id)) created += 1;
  }
  return { created };
}

/**
 * Fluxo para categorias por dispositivo (aviso diário/semanal, cujo horário
 * e fuso são configurados por assinatura, não pelo workspace): cria a
 * notificação idempotente (dedup_key já inclui o id da assinatura) e uma
 * única entrega para essa assinatura específica.
 */
export async function createDeliveryForSubscription(
  admin: SupabaseClient,
  subscriptionId: string,
  params: NotificationParams
): Promise<{ created: boolean }> {
  const notification = await upsertNotification(admin, params);
  if (!notification) return { created: false };
  const created = await createDelivery(admin, notification.id, subscriptionId);
  return { created };
}

interface DeliveryRow {
  id: string;
  attempt: number;
  subscription_id: string;
  notification: {
    type: PushCategory;
    target_url: string | null;
    dedup_key: string | null;
    metadata: { itemTitle?: string } | null;
  } | null;
  subscription: SubscriptionRow | null;
}

/** Desativa a assinatura e cancela suas entregas pendentes — usado tanto
 * pelo dispatcher (404/410 do serviço de push) quanto pelas rotas de
 * desativação/revogação manuais. */
export async function disableSubscription(admin: SupabaseClient, subscriptionId: string): Promise<void> {
  await admin
    .from('push_subscriptions')
    .update({ is_active: false, disabled_at: new Date().toISOString() })
    .eq('id', subscriptionId);
  // Nenhuma outra entrega pendente deste dispositivo poderá ser entregue.
  await admin
    .from('push_deliveries')
    .update({ status: 'cancelled' })
    .eq('subscription_id', subscriptionId)
    .eq('status', 'pending');
}

/**
 * Envia as entregas pendentes cuja próxima tentativa já venceu. Uma falha
 * isolada (num dispositivo) nunca interrompe o processamento das demais.
 * Restrito a um workspace (via !inner join na assinatura) para que o cron
 * possa processar cada workspace isoladamente, na mesma malha de
 * try/catch por workspace usada pelo automation-tick.
 */
export async function dispatchPendingDeliveries(
  admin: SupabaseClient,
  workspaceId: string,
  limit = 50
): Promise<{ sent: number; failed: number; cancelled: number }> {
  const nowIso = new Date().toISOString();
  const { data: rows } = await admin
    .from('push_deliveries')
    .select(
      'id, attempt, subscription_id, notification:notifications(type, target_url, dedup_key, metadata), subscription:push_subscriptions!inner(id, workspace_id, endpoint, p256dh, auth_key, show_details_enabled)'
    )
    .eq('status', 'pending')
    .eq('subscription.workspace_id', workspaceId)
    .lte('next_attempt_at', nowIso)
    .limit(limit);

  let sent = 0;
  let failed = 0;
  let cancelled = 0;

  for (const rawRow of (rows ?? []) as unknown as DeliveryRow[]) {
    try {
      const outcome = await dispatchOne(admin, rawRow);
      if (outcome === 'sent') sent += 1;
      else if (outcome === 'failed') failed += 1;
      else if (outcome === 'cancelled') cancelled += 1;
    } catch (e) {
      // Uma exceção inesperada num dispositivo nunca aborta os demais.
      console.error(`Falha ao processar entrega push ${rawRow.id}`, e instanceof Error ? e.message : e);
      failed += 1;
    }
  }

  return { sent, failed, cancelled };
}

async function dispatchOne(
  admin: SupabaseClient,
  row: DeliveryRow
): Promise<'sent' | 'failed' | 'cancelled'> {
  if (!row.notification || !row.subscription) {
    // Notificação ou assinatura removida entre a criação e o envio: nada a
    // fazer além de cancelar a entrega órfã.
    await admin.from('push_deliveries').update({ status: 'cancelled' }).eq('id', row.id);
    return 'cancelled';
  }

  const content = buildNotificationContent({
    category: row.notification.type,
    showDetails: row.subscription.show_details_enabled,
    itemTitle: row.notification.metadata?.itemTitle,
  });

  const payload = {
    title: content.title,
    body: content.body,
    url: row.notification.target_url ?? '/',
    tag: row.notification.dedup_key ?? row.id,
  };

  try {
    await sendWebPush(
      {
        endpoint: row.subscription.endpoint,
        keys: { p256dh: row.subscription.p256dh, auth: row.subscription.auth_key },
      },
      payload
    );
    await admin
      .from('push_deliveries')
      .update({ status: 'sent', sent_at: new Date().toISOString(), error_category: null })
      .eq('id', row.id);
    return 'sent';
  } catch (e) {
    const category = e instanceof WebPushDeliveryError ? e.category : 'unknown_error';

    if (category === 'expired_subscription') {
      await disableSubscription(admin, row.subscription_id);
      await admin
        .from('push_deliveries')
        .update({ status: 'failed', error_category: category })
        .eq('id', row.id);
      return 'failed';
    }

    const nextAttempt = row.attempt + 1;
    if (nextAttempt >= PUSH_MAX_ATTEMPTS) {
      await admin
        .from('push_deliveries')
        .update({ status: 'failed', attempt: nextAttempt, error_category: category })
        .eq('id', row.id);
      return 'failed';
    }

    const backoffMinutes = BACKOFF_MINUTES_BY_ATTEMPT[nextAttempt] ?? 15;
    await admin
      .from('push_deliveries')
      .update({
        status: 'pending',
        attempt: nextAttempt,
        error_category: category,
        next_attempt_at: new Date(Date.now() + backoffMinutes * 60_000).toISOString(),
      })
      .eq('id', row.id);
    return 'failed';
  }
}

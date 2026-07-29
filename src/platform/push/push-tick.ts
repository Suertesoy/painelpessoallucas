import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createDeliveriesForWorkspace, createDeliveryForSubscription } from './push-dispatch';
import { targetUrlForCategory } from './push-content';
import { isCoveredByGoogleCalendarReminder } from './calendar-coverage';
import { localDateTimeParts, timeToMinutes } from './local-time';

/**
 * Trabalhos do cron de push (`/api/cron/push-tick`, a cada 5 minutos) — só
 * o que precisa de precisão de minutos. Recorrências, Google Calendar e
 * Gmail continuam no cron horário existente
 * (`/api/cron/automation-tick`), inalterado.
 */

const RECOVERY_WINDOW_MS = 14 * 24 * 3600_000;

/** 1. Lembretes push vencidos — respeitando a regra de não duplicidade com o Google Calendar. */
export async function processDueTaskReminders(
  admin: SupabaseClient,
  workspaceId: string,
  now: Date
): Promise<{ notified: number; skippedByCalendar: number }> {
  const { data: due } = await admin
    .from('reminders')
    .select('id, item_id')
    .eq('workspace_id', workspaceId)
    .eq('channel', 'push')
    .eq('status', 'pending')
    .lte('remind_at', now.toISOString())
    .limit(50);

  let notified = 0;
  let skippedByCalendar = 0;

  for (const reminder of due ?? []) {
    if (!reminder.item_id) {
      await admin.from('reminders').update({ status: 'sent' }).eq('id', reminder.id);
      continue;
    }

    const { data: item } = await admin
      .from('items')
      .select('id, title, calendar_sync, deleted_at')
      .eq('id', reminder.item_id)
      .maybeSingle();

    if (!item || item.deleted_at) {
      await admin.from('reminders').update({ status: 'sent' }).eq('id', reminder.id);
      continue;
    }

    const { data: link } = await admin
      .from('calendar_event_links')
      .select('sync_status, reminders_minutes')
      .eq('item_id', item.id)
      .maybeSingle();

    const covered = isCoveredByGoogleCalendarReminder({
      calendarSync: item.calendar_sync,
      link: link ? { syncStatus: link.sync_status, remindersMinutes: link.reminders_minutes ?? [] } : null,
    });

    if (covered) {
      skippedByCalendar += 1;
    } else {
      await createDeliveriesForWorkspace(admin, {
        workspaceId,
        category: 'task_reminder',
        dedupKey: `task_reminder:${reminder.id}`,
        targetUrl: targetUrlForCategory('task_reminder', item.id),
        entityType: 'item',
        entityId: item.id,
        itemTitle: item.title ?? undefined,
      });
      notified += 1;
    }

    await admin.from('reminders').update({ status: 'sent' }).eq('id', reminder.id);
  }

  return { notified, skippedByCalendar };
}

/** 2a. Aviso diário — horário e fuso configurados por dispositivo. */
export async function processDailyPlanningNotices(
  admin: SupabaseClient,
  workspaceId: string,
  now: Date
): Promise<{ created: number }> {
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, timezone, daily_planning_time')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .is('disabled_at', null)
    .eq('daily_planning_enabled', true);

  let created = 0;
  for (const sub of subs ?? []) {
    const local = localDateTimeParts(now, sub.timezone);
    const nowMinutes = local.hour * 60 + local.minute;
    if (nowMinutes < timeToMinutes(sub.daily_planning_time)) continue;

    const result = await createDeliveryForSubscription(admin, sub.id, {
      workspaceId,
      category: 'daily_planning',
      dedupKey: `daily_planning:${sub.id}:${local.date}`,
      targetUrl: targetUrlForCategory('daily_planning'),
    });
    if (result.created) created += 1;
  }
  return { created };
}

/** 2b. Aviso semanal — dia, horário e fuso configurados por dispositivo. */
export async function processWeeklyReviewNotices(
  admin: SupabaseClient,
  workspaceId: string,
  now: Date
): Promise<{ created: number }> {
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, timezone, weekly_review_day, weekly_review_time')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .is('disabled_at', null)
    .eq('weekly_review_enabled', true);

  let created = 0;
  for (const sub of subs ?? []) {
    const local = localDateTimeParts(now, sub.timezone);
    if (local.dow !== sub.weekly_review_day) continue;
    const nowMinutes = local.hour * 60 + local.minute;
    if (nowMinutes < timeToMinutes(sub.weekly_review_time)) continue;

    const result = await createDeliveryForSubscription(admin, sub.id, {
      workspaceId,
      category: 'weekly_review',
      dedupKey: `weekly_review:${sub.id}:${local.date}`,
      targetUrl: targetUrlForCategory('weekly_review'),
    });
    if (result.created) created += 1;
  }
  return { created };
}

/**
 * 3. Recuperação idempotente: execuções de triagem de captura que
 * terminaram em falha e ainda não geraram notificação (o caminho principal
 * já tenta criar a notificação no momento da falha — isto é a rede de
 * segurança para falhas transitórias nesse momento). Restrito a uma janela
 * recente para não reprocessar o histórico inteiro a cada tick.
 */
export async function recoverCaptureFailureNotifications(
  admin: SupabaseClient,
  workspaceId: string,
  now: Date
): Promise<{ created: number }> {
  const since = new Date(now.getTime() - RECOVERY_WINDOW_MS).toISOString();

  const { data: failedRuns } = await admin
    .from('ai_runs')
    .select('id, item_id')
    .eq('workspace_id', workspaceId)
    .eq('operation', 'capture_triage')
    .eq('status', 'failed')
    .not('item_id', 'is', null)
    .gte('created_at', since)
    .limit(50);

  let created = 0;
  for (const run of failedRuns ?? []) {
    const { data: item } = await admin
      .from('items')
      .select('id, source, deleted_at')
      .eq('id', run.item_id)
      .maybeSingle();

    // A captura precisa continuar preservada e ser realmente uma captura
    // analisável (texto/áudio) — nunca falha de outra operação de IA.
    if (!item || item.deleted_at) continue;
    if (item.source !== 'quick_capture' && item.source !== 'audio_capture') continue;

    const result = await createDeliveriesForWorkspace(admin, {
      workspaceId,
      category: 'capture_failure',
      dedupKey: `capture_failure:${run.id}`,
      targetUrl: targetUrlForCategory('capture_failure', item.id),
      entityType: 'item',
      entityId: item.id,
    });
    if (result.created > 0) created += 1;
  }
  return { created };
}

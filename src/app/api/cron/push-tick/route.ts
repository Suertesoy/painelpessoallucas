export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/platform/supabase/admin-client';
import { runIdempotentJob } from '@/platform/automation/automation-runner';
import {
  processDueTaskReminders,
  processDailyPlanningNotices,
  processWeeklyReviewNotices,
  recoverCaptureFailureNotifications,
} from '@/platform/push/push-tick';
import { dispatchPendingDeliveries } from '@/platform/push/push-dispatch';
import { fiveMinuteBucketKey } from '@/platform/push/local-time';

/**
 * POST/GET /api/cron/push-tick — execução a cada 5 minutos (Vercel Cron,
 * plano Pro — ver docs/ARCHITECTURE.md § Web Push). Cuida SOMENTE do que
 * precisa de precisão de minutos:
 * 1. Lembretes push vencidos (com a checagem de não duplicidade com o
 *    Google Calendar).
 * 2. Avisos diário e semanal (horário/fuso por dispositivo).
 * 3. Recuperação idempotente de falhas de captura que ainda não geraram
 *    notificação.
 * 4. Envio das entregas pendentes (outbox `push_deliveries`), com retries
 *    e desativação de assinaturas expiradas (404/410).
 *
 * Recorrências, Google Calendar e resumos por e-mail continuam
 * exclusivamente no cron horário (`/api/cron/automation-tick`) — nada
 * pesado foi movido para cá.
 *
 * Idempotência em blocos de 5 minutos (nunca a chave horária do outro
 * cron): um lembrete criado às 14:07 e outro às 14:22 não competem pela
 * mesma chave, então ambos são processados nos seus próprios blocos.
 */

export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

async function handleTick(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const now = new Date();
  const bucketKey = fiveMinuteBucketKey(now);

  const { data: workspaces } = await admin.from('workspaces').select('id');
  const failures: { workspaceId: string; type: string; error: string }[] = [];
  const summary: Record<string, unknown> = {};

  for (const ws of workspaces ?? []) {
    const workspaceId: string = ws.id;
    try {
      await runWorkspacePushTick(admin, workspaceId, bucketKey, now, failures);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'erro desconhecido';
      failures.push({ workspaceId, type: 'push_tick', error: message });
      console.error(`Falha ao processar push-tick do workspace ${workspaceId}`, message);
    }
  }

  summary.workspaces = (workspaces ?? []).length;
  summary.failures = failures;
  return NextResponse.json({ ok: true, at: now.toISOString(), bucketKey, summary });
}

async function runWorkspacePushTick(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  workspaceId: string,
  bucketKey: string,
  now: Date,
  failures: { workspaceId: string; type: string; error: string }[]
): Promise<void> {
  const reminders = await runIdempotentJob(
    admin,
    workspaceId,
    'push_task_reminders',
    bucketKey,
    now.toISOString(),
    null,
    () => processDueTaskReminders(admin, workspaceId, now)
  );
  if (reminders.status === 'failed') {
    failures.push({ workspaceId, type: 'push_task_reminders', error: reminders.error ?? '' });
  }

  const daily = await runIdempotentJob(
    admin,
    workspaceId,
    'push_daily_planning',
    bucketKey,
    now.toISOString(),
    null,
    () => processDailyPlanningNotices(admin, workspaceId, now)
  );
  if (daily.status === 'failed') {
    failures.push({ workspaceId, type: 'push_daily_planning', error: daily.error ?? '' });
  }

  const weekly = await runIdempotentJob(
    admin,
    workspaceId,
    'push_weekly_review',
    bucketKey,
    now.toISOString(),
    null,
    () => processWeeklyReviewNotices(admin, workspaceId, now)
  );
  if (weekly.status === 'failed') {
    failures.push({ workspaceId, type: 'push_weekly_review', error: weekly.error ?? '' });
  }

  const recovery = await runIdempotentJob(
    admin,
    workspaceId,
    'push_capture_recovery',
    bucketKey,
    now.toISOString(),
    null,
    () => recoverCaptureFailureNotifications(admin, workspaceId, now)
  );
  if (recovery.status === 'failed') {
    failures.push({ workspaceId, type: 'push_capture_recovery', error: recovery.error ?? '' });
  }

  const dispatch = await runIdempotentJob(
    admin,
    workspaceId,
    'push_dispatch_deliveries',
    bucketKey,
    now.toISOString(),
    null,
    () => dispatchPendingDeliveries(admin, workspaceId)
  );
  if (dispatch.status === 'failed') {
    failures.push({ workspaceId, type: 'push_dispatch_deliveries', error: dispatch.error ?? '' });
  }
}

export async function GET(request: Request) {
  return handleTick(request);
}

export async function POST(request: Request) {
  return handleTick(request);
}

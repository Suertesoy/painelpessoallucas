import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/platform/supabase/admin-client';
import { runIdempotentJob, MAX_ATTEMPTS } from '@/platform/automation/automation-runner';
import { materializeDueRules } from '@/modules/plans/application/recurrence-materializer';
import { syncPendingCalendarLinks, getCalendarAccount } from '@/platform/integrations/calendar-sync';
import { sendDigest, getDigestSettings } from '@/platform/integrations/digest-dispatch';

/**
 * POST/GET /api/cron/automation-tick — execução horária (Vercel Cron).
 *
 * Protegido por CRON_SECRET (Authorization: Bearer <segredo>). A execução:
 * 1. Materializa regras de recorrência vencidas (idempotente).
 * 2. Converte reminders vencidos em notificações.
 * 3. Ressincroniza vínculos de Calendar pendentes/com erro.
 * 4. Envia resumos diário/semanal no horário configurado.
 * 5. Alerta prazos críticos (se ativado).
 * 6. Retenta falhas recuperáveis (via automation_runs, máx. 3 tentativas).
 */

export const maxDuration = 300;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

function spLocalParts(now: Date): { date: string; hour: number; minute: number; dow: number } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(now)) parts[p.type] = p.value;
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    dow: dowMap[parts.weekday] ?? new Date(now).getUTCDay(),
  };
}

async function handleTick(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const now = new Date();
  const local = spLocalParts(now);
  const hourKey = `${local.date}T${String(local.hour).padStart(2, '0')}`;

  const summary: Record<string, unknown> = {};
  const failures: { workspaceId: string; type: string; error: string }[] = [];

  const { data: workspaces } = await admin.from('workspaces').select('id');

  for (const ws of workspaces ?? []) {
    const workspaceId: string = ws.id;

    // 1. Recorrências vencidas -------------------------------------------------
    const recurrence = await runIdempotentJob(
      admin,
      workspaceId,
      'materialize_recurrences',
      hourKey,
      now.toISOString(),
      null,
      async () => {
        const results = await materializeDueRules(admin, now);
        return { rules: results.length, created: results.reduce((s, r) => s + r.created, 0) };
      }
    );
    if (recurrence.status === 'failed') {
      failures.push({ workspaceId, type: 'materialize_recurrences', error: recurrence.error ?? '' });
    }

    // 2. Reminders vencidos → notificações ------------------------------------
    const reminders = await runIdempotentJob(
      admin,
      workspaceId,
      'reminders_to_notifications',
      hourKey,
      now.toISOString(),
      null,
      async () => {
        const { data: due } = await admin
          .from('reminders')
          .select('id, message, item_id, plan_action_id')
          .eq('workspace_id', workspaceId)
          .eq('status', 'pending')
          .lte('remind_at', now.toISOString())
          .limit(50);
        for (const reminder of due ?? []) {
          await admin.from('notifications').insert({
            workspace_id: workspaceId,
            type: 'reminder',
            title: 'Lembrete',
            body: reminder.message,
            entity_type: reminder.item_id ? 'item' : 'plan_action',
            entity_id: reminder.item_id ?? reminder.plan_action_id,
          });
          await admin.from('reminders').update({ status: 'sent' }).eq('id', reminder.id);
        }
        return { notified: (due ?? []).length };
      }
    );
    if (reminders.status === 'failed') {
      failures.push({ workspaceId, type: 'reminders', error: reminders.error ?? '' });
    }

    // 3. Calendar: vínculos pendentes -----------------------------------------
    const calendarAccount = await getCalendarAccount(admin, workspaceId);
    if (calendarAccount) {
      const calendar = await runIdempotentJob(
        admin,
        workspaceId,
        'calendar_sync_pending',
        hourKey,
        now.toISOString(),
        null,
        () => syncPendingCalendarLinks(admin, admin, workspaceId)
      );
      if (calendar.status === 'failed') {
        failures.push({ workspaceId, type: 'calendar_sync', error: calendar.error ?? '' });
      }
    }

    // 4/5. Resumos e alertas ----------------------------------------------------
    const settings = await getDigestSettings(admin, workspaceId);
    if (settings) {
      const minutesNow = local.hour * 60 + local.minute;
      const timeToMinutes = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };

      if (settings.daily_digest_enabled && minutesNow >= timeToMinutes(settings.daily_digest_time)) {
        const daily = await runIdempotentJob(
          admin,
          workspaceId,
          'daily_digest',
          local.date,
          now.toISOString(),
          null,
          () => sendDigest(admin, admin, workspaceId, 'daily', local.date)
        );
        if (daily.status === 'failed') {
          failures.push({ workspaceId, type: 'daily_digest', error: daily.error ?? '' });
        }
      }

      if (
        settings.weekly_digest_enabled &&
        local.dow === settings.weekly_digest_day &&
        minutesNow >= timeToMinutes(settings.weekly_digest_time)
      ) {
        const weekly = await runIdempotentJob(
          admin,
          workspaceId,
          'weekly_digest',
          local.date,
          now.toISOString(),
          null,
          () => sendDigest(admin, admin, workspaceId, 'weekly', local.date)
        );
        if (weekly.status === 'failed') {
          failures.push({ workspaceId, type: 'weekly_digest', error: weekly.error ?? '' });
        }
      }

      if (settings.critical_alerts_enabled) {
        await runIdempotentJob(
          admin,
          workspaceId,
          'critical_alerts',
          local.date,
          now.toISOString(),
          null,
          async () => {
            const in24h = new Date(now.getTime() + 24 * 3600_000).toISOString();
            const { data: critical } = await admin
              .from('items')
              .select('title, content, type, status, priority, due_at, scheduled_at')
              .eq('workspace_id', workspaceId)
              .eq('priority', 'critical')
              .is('deleted_at', null)
              .not('status', 'in', '(completed,archived)')
              .not('due_at', 'is', null)
              .lte('due_at', in24h);
            if (!critical || critical.length === 0) {
              return { alerts: 0 };
            }
            return sendDigest(admin, admin, workspaceId, 'critical', local.date, {
              criticalItems: critical,
            });
          }
        );
      }

      // 6. Falhas persistentes → alerta (uma vez por dia por tipo).
      const { data: exhausted } = await admin
        .from('automation_runs')
        .select('automation_type, error_message')
        .eq('workspace_id', workspaceId)
        .eq('status', 'failed')
        .gte('attempt', MAX_ATTEMPTS)
        .gte('created_at', `${local.date}T00:00:00Z`);
      if (settings.critical_alerts_enabled && exhausted && exhausted.length > 0) {
        await runIdempotentJob(
          admin,
          workspaceId,
          'automation_failure_alert',
          local.date,
          now.toISOString(),
          { count: exhausted.length },
          () =>
            sendDigest(admin, admin, workspaceId, 'automation_failure', local.date, {
              failures: exhausted.map((f) => ({
                type: f.automation_type,
                error: f.error_message ?? 'erro',
              })),
            })
        );
      }
    }
  }

  summary.workspaces = (workspaces ?? []).length;
  summary.failures = failures;
  return NextResponse.json({ ok: true, at: now.toISOString(), local, summary });
}

export async function GET(request: Request) {
  return handleTick(request);
}

export async function POST(request: Request) {
  return handleTick(request);
}

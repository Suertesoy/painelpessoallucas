import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildDailyDigest, buildWeeklyDigest, renderCriticalAlert, renderAutomationFailure, type DigestKind, type DigestContent } from './digest';
import { resolveEmailSender } from './email-sender';
import { GmailSender, getGmailAccount } from './gmail-sender';

/**
 * Despacho de resumos: só envia com a preferência explicitamente ativa e o
 * Gmail conectado. Destinatário: digest_recipient ou o e-mail da conta.
 */

export interface DigestSettings {
  daily_digest_enabled: boolean;
  daily_digest_time: string;
  weekly_digest_enabled: boolean;
  weekly_digest_day: number;
  weekly_digest_time: string;
  critical_alerts_enabled: boolean;
  digest_recipient: string | null;
  timezone: string;
}

export async function getDigestSettings(
  db: SupabaseClient,
  workspaceId: string
): Promise<DigestSettings | null> {
  const { data } = await db
    .from('workspace_settings')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  return (data as DigestSettings | null) ?? null;
}

export type SendResult =
  | { sent: true; kind: DigestKind; to: string }
  | { sent: false; reason: string };

export async function sendDigest(
  admin: SupabaseClient,
  db: SupabaseClient,
  workspaceId: string,
  kind: DigestKind,
  localDate: string,
  options?: {
    criticalItems?: Parameters<typeof renderCriticalAlert>[0];
    failures?: Parameters<typeof renderAutomationFailure>[0];
    /** true quando o envio é manual (teste) — ignora o toggle de agenda. */
    manual?: boolean;
  }
): Promise<SendResult> {
  const settings = await getDigestSettings(db, workspaceId);

  const enabled =
    options?.manual === true ||
    (kind === 'daily' && settings?.daily_digest_enabled) ||
    (kind === 'weekly' && settings?.weekly_digest_enabled) ||
    ((kind === 'critical' || kind === 'automation_failure') &&
      settings?.critical_alerts_enabled);
  if (!enabled) {
    return { sent: false, reason: 'Preferência desativada — nada foi enviado.' };
  }

  const gmailAccount = await getGmailAccount(db, workspaceId);
  if (!gmailAccount) {
    return { sent: false, reason: 'Gmail não conectado em Configurações → Integrações.' };
  }

  const to = settings?.digest_recipient || gmailAccount.external_account_email;
  if (!to) {
    return { sent: false, reason: 'Destinatário não configurado.' };
  }

  let content: DigestContent;
  switch (kind) {
    case 'daily':
      content = await buildDailyDigest(db, workspaceId, localDate);
      break;
    case 'weekly':
      content = await buildWeeklyDigest(db, workspaceId, localDate);
      break;
    case 'critical':
      content = renderCriticalAlert(options?.criticalItems ?? []);
      break;
    case 'automation_failure':
      content = renderAutomationFailure(options?.failures ?? []);
      break;
  }

  const sender = resolveEmailSender(() => new GmailSender(admin, gmailAccount.id));
  await sender.send({ to, subject: content.subject, text: content.text });

  await db.from('domain_events').insert({
    workspace_id: workspaceId,
    type: `digest.${kind}_sent`,
    entity_id: workspaceId,
    source: 'automation',
    payload: { to, subject: content.subject, date: localDate },
  });

  return { sent: true, kind, to };
}

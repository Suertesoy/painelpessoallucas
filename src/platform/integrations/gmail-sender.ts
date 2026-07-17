import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { getValidAccessToken, googleApiFetch } from './google-client';
import type { EmailMessage, EmailSender } from './email-sender';

/**
 * Envio de e-mail via Gmail API (scope mínimo gmail.send).
 * Sem leitura de caixa de entrada — documentado como fase posterior.
 */
export class GmailSender implements EmailSender {
  constructor(
    private admin: SupabaseClient,
    private accountId: string
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const accessToken = await getValidAccessToken(this.admin, this.accountId);

    const mime = [
      `To: ${message.to}`,
      `Subject: =?UTF-8?B?${Buffer.from(message.subject, 'utf8').toString('base64')}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(message.text, 'utf8').toString('base64'),
    ].join('\r\n');

    const res = await googleApiFetch(
      accessToken,
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        body: JSON.stringify({
          raw: Buffer.from(mime, 'utf8').toString('base64url'),
        }),
      }
    );
    if (!res.ok) {
      throw new Error(`Falha ao enviar e-mail (HTTP ${res.status})`);
    }
  }
}

export async function getGmailAccount(
  db: SupabaseClient,
  workspaceId: string
): Promise<{ id: string; external_account_email: string | null } | null> {
  const { data } = await db
    .from('integration_accounts')
    .select('id, external_account_email')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'google')
    .eq('service', 'gmail')
    .eq('status', 'connected')
    .maybeSingle();
  return data ?? null;
}

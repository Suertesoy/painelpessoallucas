import 'server-only';

import webpush from 'web-push';

/**
 * Configuração VAPID — exclusivamente servidor (a chave privada nunca deve
 * chegar ao bundle do navegador; o import de 'server-only' garante isso em
 * tempo de build). A chave pública é lida do navegador via
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY (variável separada, sem tocar neste módulo).
 */

let configured = false;

export function isVapidConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT
  );
}

function ensureConfigured(): void {
  if (configured) return;
  if (!isVapidConfigured()) {
    throw new Error('VAPID não configurado no servidor (NEXT_PUBLIC_VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT).');
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

export interface PushSubscriptionKeys {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Categoria sanitizada de erro — nunca a mensagem crua do serviço de push. */
export type PushErrorCategory =
  | 'expired_subscription'
  | 'rate_limited'
  | 'payload_too_large'
  | 'network_error'
  | 'server_error'
  | 'unknown_error';

export class WebPushDeliveryError extends Error {
  constructor(
    message: string,
    public readonly category: PushErrorCategory,
    public readonly statusCode?: number
  ) {
    super(message);
  }
}

function categorizeError(statusCode: number | undefined): PushErrorCategory {
  if (statusCode === 404 || statusCode === 410) return 'expired_subscription';
  if (statusCode === 429) return 'rate_limited';
  if (statusCode === 413) return 'payload_too_large';
  if (statusCode !== undefined && statusCode >= 500) return 'server_error';
  if (statusCode !== undefined && statusCode >= 400) return 'unknown_error';
  return 'network_error';
}

/**
 * Envia uma notificação Web Push. Lança WebPushDeliveryError com categoria
 * sanitizada — o chamador nunca precisa (nem deve) propagar a mensagem
 * crua do serviço de push para fora deste módulo.
 */
export async function sendWebPush(
  subscription: PushSubscriptionKeys,
  payload: Record<string, unknown>
): Promise<void> {
  ensureConfigured();
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (e) {
    const statusCode = (e as { statusCode?: number } | null)?.statusCode;
    throw new WebPushDeliveryError(
      e instanceof Error ? e.message : 'Falha no envio Web Push',
      categorizeError(statusCode),
      statusCode
    );
  }
}

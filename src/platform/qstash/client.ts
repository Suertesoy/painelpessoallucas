import 'server-only';
import { Client, Receiver } from '@upstash/qstash';

/**
 * Integração mínima com o Upstash QStash — exclusivamente servidor (o import
 * de 'server-only' impede que token e chaves de assinatura cheguem ao bundle
 * do navegador).
 *
 * Variáveis (Vercel → Settings → Environment Variables, sem NEXT_PUBLIC_):
 *   QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY
 *   QSTASH_URL (opcional — só quando o console indicar uma URL regional)
 */

export function isQStashConfigured(): boolean {
  return Boolean(
    process.env.QSTASH_TOKEN && process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY
  );
}

export function getQStashClient(): Client {
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error('QSTASH_TOKEN não configurado no servidor.');
  return new Client({ token, baseUrl: process.env.QSTASH_URL || undefined });
}

export function getQStashReceiver(): Receiver {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) {
    throw new Error('Chaves de assinatura do QStash não configuradas no servidor.');
  }
  // devMode: false — nunca aceita as chaves públicas do servidor local de
  // desenvolvimento do QStash, mesmo que QSTASH_DEV esteja definido.
  return new Receiver({ currentSigningKey, nextSigningKey, devMode: false });
}

/**
 * URL pública absoluta do callback de fim de descanso. A mesma função é usada
 * para publicar e para conferir o claim `sub` da assinatura, então uma
 * mensagem publicada para outra URL nunca é aceita aqui. Na Vercel vale o
 * domínio de produção definido pela própria plataforma (o mesmo usado em
 * layout.tsx); NEXT_PUBLIC_APP_URL só fora dela (ex.: túnel em dev). Sem
 * nenhum dos dois devolve null — o recurso fica indisponível em vez de chutar
 * um endereço.
 */
export function restCallbackUrl(): string | null {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const base = host ? `https://${host}` : explicit ? explicit : null;
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/api/workouts/rest-callback`;
}

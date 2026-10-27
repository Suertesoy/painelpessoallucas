import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { buildNotificationContent } from '@/platform/push/push-content';
import { sendWebPush, WebPushDeliveryError } from '@/platform/push/vapid';
import { disableSubscription } from '@/platform/push/push-dispatch';

/**
 * Aviso Web Push de fim de descanso (ver docs/TREINOS_AVISO_DESCANSO_PUSH.md).
 *
 * Duas metades, ambas lendo SEMPRE o estado persistido no banco:
 *  - `scheduleRestAlert`: chamado pelo app logo depois de gravar o descanso;
 *    publica no QStash um callback para (sessão, geração) no prazo salvo.
 *  - `handleRestAlertCallback`: chamado pelo QStash (assinatura já verificada
 *    pela rota); revalida tudo e envia no máximo um aviso por dispositivo.
 *
 * A geração (`rest_nonce`) é carimbada por trigger no banco a cada novo
 * prazo e zerada ao pausar/pular/encerrar — então qualquer callback de um
 * descanso que não é mais o atual é descartado sem precisar cancelar nada
 * na fila do QStash.
 */

/** O callback pode chegar até 2 s antes do prazo (arredondamento/relógios). */
export const REST_ALERT_EARLY_TOLERANCE_MS = 2_000;
/**
 * Atraso máximo aceito. Para descansos de 30–180 s, um "descanso concluído"
 * que chega 45 s depois já perdeu a utilidade — é suprimido em vez de enviado.
 */
export const REST_ALERT_MAX_LATE_MS = 45_000;
/** Retries do QStash: só para falha transitória do nosso lado (5xx). */
export const REST_ALERT_QSTASH_RETRIES = 1;

export const RestAlertPayloadSchema = z
  .object({
    v: z.literal(1),
    sessionId: z.string().uuid(),
    restNonce: z.string().uuid(),
  })
  .strict();
export type RestAlertPayload = z.infer<typeof RestAlertPayloadSchema>;

interface SessionRow {
  id: string;
  workspace_id: string;
  athlete_id: string;
  status: string;
  rest_ends_at: string | null;
  rest_paused_remaining_seconds: number | null;
  rest_nonce: string | null;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

const SESSION_COLUMNS = 'id, workspace_id, athlete_id, status, rest_ends_at, rest_paused_remaining_seconds, rest_nonce';

/** Erro de infraestrutura (banco indisponível etc.) — a rota responde 5xx. */
export class RestAlertInfraError extends Error {}

type RunningRest = { session: SessionRow; endsAtMs: number; nonce: string };

function runningRestOf(session: SessionRow): RunningRest | null {
  if (session.status !== 'in_progress') return null;
  if (!session.rest_ends_at || !session.rest_nonce || session.rest_paused_remaining_seconds != null) return null;
  const endsAtMs = new Date(session.rest_ends_at).getTime();
  if (!Number.isFinite(endsAtMs)) return null;
  return { session, endsAtMs, nonce: session.rest_nonce };
}

type RecipientResult =
  | { ok: true; userId: string; subscriptions: SubscriptionRow[] }
  | { ok: false; reason: 'athlete_not_linked' | 'recipient_not_member' | 'no_enabled_device' };

/**
 * Destinatário = usuário vinculado ao ATLETA da sessão (nunca quem tocou no
 * botão, nunca algo vindo do payload). Exige que ele ainda seja membro do
 * workspace da sessão e devolve só os dispositivos dele com o aviso ligado.
 */
async function resolveRecipient(admin: SupabaseClient, session: SessionRow): Promise<RecipientResult> {
  const { data: athlete, error: athleteError } = await admin
    .from('workout_athletes')
    .select('id, user_id')
    .eq('id', session.athlete_id)
    .eq('workspace_id', session.workspace_id)
    .maybeSingle();
  if (athleteError) throw new RestAlertInfraError('Falha ao ler o atleta.');
  const userId = (athlete?.user_id as string | null | undefined) ?? null;
  if (!userId) return { ok: false, reason: 'athlete_not_linked' };

  const { data: membership, error: memberError } = await admin
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', session.workspace_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (memberError) throw new RestAlertInfraError('Falha ao ler o workspace.');
  if (!membership) return { ok: false, reason: 'recipient_not_member' };

  const { data: subs, error: subsError } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('disabled_at', null)
    .eq('workout_rest_enabled', true);
  if (subsError) throw new RestAlertInfraError('Falha ao ler os dispositivos.');
  if (!subs || subs.length === 0) return { ok: false, reason: 'no_enabled_device' };

  return { ok: true, userId, subscriptions: subs as SubscriptionRow[] };
}

// --- Agendamento ----------------------------------------------------------------------------

export interface PublishRequest {
  url: string;
  body: RestAlertPayload;
  notBefore: number;
  deduplicationId: string;
  retries: number;
  retryDelay: string;
  timeout: number;
}

export interface ScheduleDeps {
  /** Cliente do usuário logado (RLS): só enxerga sessões do workspace dele. */
  db: SupabaseClient;
  admin: SupabaseClient;
  publish: (request: PublishRequest) => Promise<{ messageId: string }>;
  callbackUrl: string;
  nowMs: number;
}

export type ScheduleResult =
  | { scheduled: true; messageId: string; notBefore: number }
  | {
      scheduled: false;
      reason:
        | 'session_not_found'
        | 'rest_not_running'
        | 'rest_elapsed'
        | 'athlete_not_linked'
        | 'recipient_not_member'
        | 'no_enabled_device';
    };

export async function scheduleRestAlert(deps: ScheduleDeps, sessionId: string): Promise<ScheduleResult> {
  const { data, error } = await deps.db.from('workout_sessions').select(SESSION_COLUMNS).eq('id', sessionId).maybeSingle();
  if (error) throw new RestAlertInfraError('Falha ao ler a sessão.');
  if (!data) return { scheduled: false, reason: 'session_not_found' };

  const rest = runningRestOf(data as SessionRow);
  if (!rest) return { scheduled: false, reason: 'rest_not_running' };
  if (rest.endsAtMs <= deps.nowMs) return { scheduled: false, reason: 'rest_elapsed' };

  // Não gasta mensagem do plano gratuito se ninguém vai receber.
  const recipient = await resolveRecipient(deps.admin, rest.session);
  if (!recipient.ok) return { scheduled: false, reason: recipient.reason };

  const notBefore = Math.ceil(rest.endsAtMs / 1000);
  const { messageId } = await deps.publish({
    url: deps.callbackUrl,
    body: { v: 1, sessionId: rest.session.id, restNonce: rest.nonce },
    notBefore,
    // Duplo toque, retry do app ou dois aparelhos abertos: a mesma geração
    // vira uma única mensagem na fila.
    deduplicationId: `workout-rest-${rest.session.id}-${rest.nonce}`,
    retries: REST_ALERT_QSTASH_RETRIES,
    retryDelay: '2000',
    timeout: 15,
  });
  return { scheduled: true, messageId, notBefore };
}

// --- Callback -------------------------------------------------------------------------------

export interface CallbackDeps {
  admin: SupabaseClient;
  nowMs: number;
}

export type CallbackResult =
  | { sent: true; accepted: number; failed: number; duplicates: number }
  | {
      sent: false;
      reason:
        | 'session_not_found'
        | 'rest_superseded'
        | 'too_early'
        | 'stale'
        | 'athlete_not_linked'
        | 'recipient_not_member'
        | 'no_enabled_device'
        | 'already_handled';
    };

export async function handleRestAlertCallback(deps: CallbackDeps, payload: RestAlertPayload): Promise<CallbackResult> {
  const { admin, nowMs } = deps;

  const { data, error } = await admin.from('workout_sessions').select(SESSION_COLUMNS).eq('id', payload.sessionId).maybeSingle();
  if (error) throw new RestAlertInfraError('Falha ao ler a sessão.');
  if (!data) return { sent: false, reason: 'session_not_found' };

  // Pausado, pulado, reiniciado, ajustado, sessão encerrada/cancelada: em
  // todos esses casos a geração atual não é mais a do agendamento.
  const rest = runningRestOf(data as SessionRow);
  if (!rest || rest.nonce !== payload.restNonce) return { sent: false, reason: 'rest_superseded' };

  if (nowMs < rest.endsAtMs - REST_ALERT_EARLY_TOLERANCE_MS) return { sent: false, reason: 'too_early' };
  if (nowMs - rest.endsAtMs > REST_ALERT_MAX_LATE_MS) return { sent: false, reason: 'stale' };

  const recipient = await resolveRecipient(admin, rest.session);
  if (!recipient.ok) return { sent: false, reason: recipient.reason };

  const content = buildNotificationContent({ category: 'workout_rest', showDetails: false });
  const message = {
    title: content.title,
    body: content.body,
    url: `/treinos/${rest.session.athlete_id}/sessao/${rest.session.id}`,
    // Mesma tag para a sessão inteira: um aviso novo substitui o anterior na
    // Central de Notificações em vez de empilhar.
    tag: `workout-rest:${rest.session.id}`,
    kind: 'workout_rest',
  };

  let accepted = 0;
  let failed = 0;
  let duplicates = 0;
  let claimErrors = 0;

  for (const sub of recipient.subscriptions) {
    // Reivindicação atômica: só quem insere a linha envia. Retries do QStash
    // e callbacks simultâneos batem na chave única (23505) e param aqui.
    const { data: claim, error: claimError } = await admin
      .from('workout_rest_push_deliveries')
      .insert({
        workspace_id: rest.session.workspace_id,
        session_id: rest.session.id,
        rest_nonce: rest.nonce,
        subscription_id: sub.id,
        rest_ends_at: rest.session.rest_ends_at,
        status: 'claimed',
      })
      .select('id')
      .single();
    if (claimError?.code === '23505') {
      duplicates += 1;
      continue;
    }
    if (claimError || !claim) {
      claimErrors += 1;
      continue;
    }

    try {
      await sendWebPush({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, message);
      // 'accepted' = o serviço de push aceitou. Não prova exibição no iPhone.
      await admin.from('workout_rest_push_deliveries').update({ status: 'accepted', error_category: null }).eq('id', claim.id);
      accepted += 1;
    } catch (e) {
      const category = e instanceof WebPushDeliveryError ? e.category : 'unknown_error';
      // Sem novo envio: um aviso de descanso reenviado minutos depois é pior
      // do que nenhum aviso.
      await admin.from('workout_rest_push_deliveries').update({ status: 'failed', error_category: category }).eq('id', claim.id);
      if (category === 'expired_subscription') await disableSubscription(admin, sub.id);
      failed += 1;
    }
  }

  // Nada foi reivindicado por erro de banco: deixa o QStash tentar de novo
  // (o limite de atraso continua valendo no retry).
  if (claimErrors > 0 && accepted + failed + duplicates === 0) {
    throw new RestAlertInfraError('Falha ao registrar o envio.');
  }
  if (accepted + failed === 0) return { sent: false, reason: 'already_handled' };
  return { sent: true, accepted, failed, duplicates };
}

// --- Estado para a interface ------------------------------------------------------------------

export type AthleteLink = 'mine' | 'other' | 'unlinked';

/** Para quem vão os avisos deste atleta — só a relação, nunca o id do outro usuário. */
export async function athleteLinkFor(db: SupabaseClient, athleteId: string, userId: string): Promise<AthleteLink | null> {
  const { data, error } = await db.from('workout_athletes').select('id, user_id').eq('id', athleteId).maybeSingle();
  if (error) throw new RestAlertInfraError('Falha ao ler o atleta.');
  if (!data) return null;
  if (!data.user_id) return 'unlinked';
  return data.user_id === userId ? 'mine' : 'other';
}

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/platform/supabase/admin-client';
import { isVapidConfigured } from '@/platform/push/vapid';
import { getQStashReceiver, isQStashConfigured, restCallbackUrl } from '@/platform/qstash/client';
import { handleRestAlertCallback, RestAlertInfraError, RestAlertPayloadSchema } from '@/platform/workouts/rest-alert';

/** O payload legítimo tem ~120 bytes; nada maior é sequer verificado. */
const MAX_BODY_BYTES = 1024;
/** Folga de relógio para os claims nbf/exp do JWT do QStash. */
const SIGNATURE_CLOCK_TOLERANCE_SECONDS = 5;

/**
 * POST /api/workouts/rest-callback — chamado SOMENTE pelo Upstash QStash no
 * fim de um descanso. Público no proxy (não há cookie de login numa chamada
 * servidor-a-servidor), por isso a única credencial aceita é a assinatura
 * JWT do QStash (`Upstash-Signature`): chave de assinatura do projeto, hash
 * do corpo bruto e URL de destino conferidos pelo SDK oficial.
 *
 * O corpo só aponta (sessão, geração); destinatário e dispositivos vêm do
 * banco. Resultados "não enviar" respondem 200 de propósito — o QStash só
 * repete em 5xx, e repetir um descanso cancelado não faz sentido.
 */
export async function POST(request: Request) {
  const signature = request.headers.get('upstash-signature');
  if (!signature) return NextResponse.json({ error: 'Assinatura ausente.' }, { status: 401 });

  const callbackUrl = restCallbackUrl();
  if (!isQStashConfigured() || !isVapidConfigured() || !callbackUrl) {
    return NextResponse.json({ error: 'Avisos de descanso não configurados no servidor.' }, { status: 503 });
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_BODY_BYTES) return NextResponse.json({ error: 'Corpo grande demais.' }, { status: 413 });
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'Corpo grande demais.' }, { status: 413 });

  try {
    const valid = await getQStashReceiver().verify({
      signature,
      body: rawBody,
      url: callbackUrl,
      clockTolerance: SIGNATURE_CLOCK_TOLERANCE_SECONDS,
    });
    if (!valid) return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 401 });
  } catch {
    // SignatureError (chave, corpo, URL ou validade) — sem detalhes na resposta.
    return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 401 });
  }

  let json: unknown = null;
  try {
    json = JSON.parse(rawBody);
  } catch {
    json = null;
  }
  const payload = RestAlertPayloadSchema.safeParse(json);
  if (!payload.success) return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });

  try {
    const result = await handleRestAlertCallback({ admin: getSupabaseAdminClient(), nowMs: Date.now() }, payload.data);
    return NextResponse.json(result);
  } catch (e) {
    console.error('Falha no callback de descanso:', e instanceof RestAlertInfraError ? e.message : 'erro inesperado');
    return NextResponse.json({ error: 'Falha temporária.' }, { status: 500 });
  }
}

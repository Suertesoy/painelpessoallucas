// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignJWT, base64url } from 'jose';
import { createHash } from 'node:crypto';

vi.mock('server-only', () => ({}));
vi.mock('@/platform/supabase/admin-client', () => ({ getSupabaseAdminClient: vi.fn(() => ({ admin: true })) }));
vi.mock('@/platform/push/vapid', () => ({ isVapidConfigured: vi.fn(() => true) }));
vi.mock('@/platform/workouts/rest-alert', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/platform/workouts/rest-alert')>();
  return { ...real, handleRestAlertCallback: vi.fn() };
});

import { POST } from '@/app/api/workouts/rest-callback/route';
import { handleRestAlertCallback, RestAlertInfraError } from '@/platform/workouts/rest-alert';
import { isVapidConfigured } from '@/platform/push/vapid';

/**
 * Rota pública do callback: a verificação usa o Receiver REAL do SDK do
 * QStash, com JWTs assinados aqui do mesmo jeito que o QStash assina
 * (HS256, iss=Upstash, sub=URL de destino, body=sha256 do corpo bruto).
 */

const CURRENT_KEY = 'sig_test_current_key_0123456789abcdef';
const NEXT_KEY = 'sig_test_next_key_fedcba9876543210';
const APP_URL = 'https://painel.example';
const CALLBACK_URL = `${APP_URL}/api/workouts/rest-callback`;
const SESSION_ID = '5a3c6f1e-7d8b-4c9e-8f0a-1b2c3d4e5f6a';
const NONCE = '7c5e8b3a-9f0d-4e1a-8b2c-3d4e5f6a7b8c';
const BODY = JSON.stringify({ v: 1, sessionId: SESSION_ID, restNonce: NONCE });

async function sign(body: string, opts: { key?: string; sub?: string; expSecondsFromNow?: number; issuer?: string; bodyOverride?: string } = {}) {
  const hash = base64url.encode(createHash('sha256').update(opts.bodyOverride ?? body).digest());
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ body: hash })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(opts.issuer ?? 'Upstash')
    .setSubject(opts.sub ?? CALLBACK_URL)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + (opts.expSecondsFromNow ?? 300))
    .setJti(`msg_${Math.random().toString(36).slice(2)}`)
    .sign(new TextEncoder().encode(opts.key ?? CURRENT_KEY));
}

function request(body: string, signature?: string) {
  return new Request(CALLBACK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(signature ? { 'Upstash-Signature': signature } : {}) },
    body,
  });
}

beforeEach(() => {
  process.env.QSTASH_TOKEN = 'test-token';
  process.env.QSTASH_CURRENT_SIGNING_KEY = CURRENT_KEY;
  process.env.QSTASH_NEXT_SIGNING_KEY = NEXT_KEY;
  process.env.NEXT_PUBLIC_APP_URL = APP_URL;
  vi.mocked(isVapidConfigured).mockReturnValue(true);
  vi.mocked(handleRestAlertCallback).mockReset();
  vi.mocked(handleRestAlertCallback).mockResolvedValue({ sent: true, accepted: 1, failed: 0, duplicates: 0 });
});

describe('POST /api/workouts/rest-callback — autenticação pelo QStash', () => {
  it('callback com assinatura válida é processado com o payload validado', async () => {
    const res = await POST(request(BODY, await sign(BODY)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true, accepted: 1, failed: 0, duplicates: 0 });
    expect(handleRestAlertCallback).toHaveBeenCalledWith(expect.objectContaining({ nowMs: expect.any(Number) }), {
      v: 1,
      sessionId: SESSION_ID,
      restNonce: NONCE,
    });
  });

  it('aceita a próxima chave de assinatura (rotação de chaves)', async () => {
    const res = await POST(request(BODY, await sign(BODY, { key: NEXT_KEY })));
    expect(res.status).toBe(200);
  });

  it('chamada anônima, sem assinatura, é rejeitada sem tocar no banco', async () => {
    const res = await POST(request(BODY));
    expect(res.status).toBe(401);
    expect(handleRestAlertCallback).not.toHaveBeenCalled();
  });

  it.each([
    ['chave errada', { key: 'chave-de-um-atacante-qualquer-123456' }],
    ['outra URL de destino', { sub: 'https://outro-app.example/api/workouts/rest-callback' }],
    ['emissor diferente', { issuer: 'Atacante' }],
    ['token expirado (replay tardio)', { expSecondsFromNow: -60 }],
    ['corpo adulterado depois de assinado', { bodyOverride: JSON.stringify({ v: 1, sessionId: SESSION_ID, restNonce: '8d6f9c4b-0a1e-4f2b-9c3d-4e5f6a7b8c9d' }) }],
  ])('assinatura inválida (%s) é rejeitada', async (_label, opts) => {
    const res = await POST(request(BODY, await sign(BODY, opts)));
    expect(res.status).toBe(401);
    expect(handleRestAlertCallback).not.toHaveBeenCalled();
  });

  it('assinatura que não é JWT é rejeitada', async () => {
    const res = await POST(request(BODY, 'not-a-jwt'));
    expect(res.status).toBe(401);
  });

  it('sem chaves configuradas responde 503 (não aceita nada "por falta de chave")', async () => {
    delete process.env.QSTASH_NEXT_SIGNING_KEY;
    const res = await POST(request(BODY, await sign(BODY)));
    expect(res.status).toBe(503);
    expect(handleRestAlertCallback).not.toHaveBeenCalled();
  });

  it('sem VAPID configurado responde 503', async () => {
    vi.mocked(isVapidConfigured).mockReturnValue(false);
    expect((await POST(request(BODY, await sign(BODY)))).status).toBe(503);
  });

  it('corpo acima do limite é recusado antes de verificar', async () => {
    const big = JSON.stringify({ v: 1, sessionId: SESSION_ID, restNonce: NONCE, pad: 'x'.repeat(2000) });
    const res = await POST(request(big, await sign(big)));
    expect(res.status).toBe(413);
    expect(handleRestAlertCallback).not.toHaveBeenCalled();
  });

  it('payload assinado mas fora do contrato (campos extras, destinatário) é recusado', async () => {
    const evil = JSON.stringify({ v: 1, sessionId: SESSION_ID, restNonce: NONCE, endpoint: 'https://push.example/x' });
    const res = await POST(request(evil, await sign(evil)));
    expect(res.status).toBe(400);
    expect(handleRestAlertCallback).not.toHaveBeenCalled();
  });

  it('erro de infraestrutura vira 500 (QStash pode repetir; o limite de atraso continua valendo)', async () => {
    vi.mocked(handleRestAlertCallback).mockRejectedValueOnce(new RestAlertInfraError('db down'));
    expect((await POST(request(BODY, await sign(BODY)))).status).toBe(500);
  });

  it('decisão de não enviar responde 200 (sem retry de descanso cancelado)', async () => {
    vi.mocked(handleRestAlertCallback).mockResolvedValueOnce({ sent: false, reason: 'rest_superseded' });
    const res = await POST(request(BODY, await sign(BODY)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: false, reason: 'rest_superseded' });
  });
});

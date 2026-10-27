// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/platform/supabase/session', () => ({ getSessionContext: vi.fn() }));
vi.mock('@/platform/supabase/admin-client', () => ({ getSupabaseAdminClient: vi.fn(() => ({ admin: true })) }));
vi.mock('@/platform/push/vapid', () => ({ isVapidConfigured: vi.fn(() => true) }));
vi.mock('@/platform/qstash/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/platform/qstash/client')>();
  return { ...real, getQStashClient: vi.fn() };
});
vi.mock('@/platform/workouts/rest-alert', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/platform/workouts/rest-alert')>();
  return { ...real, scheduleRestAlert: vi.fn(), athleteLinkFor: vi.fn() };
});

import { GET, POST } from '@/app/api/workouts/rest-schedule/route';
import { getSessionContext } from '@/platform/supabase/session';
import { getQStashClient } from '@/platform/qstash/client';
import { athleteLinkFor, RestAlertInfraError, scheduleRestAlert, type PublishRequest } from '@/platform/workouts/rest-alert';

const SESSION_ID = '5a3c6f1e-7d8b-4c9e-8f0a-1b2c3d4e5f6a';
const ATHLETE_ID = '3e1a4d9c-5b6f-4a7c-8d8e-9f0a1b2c3d4e';
const userClient = { userScoped: true };
const publishJSON = vi.fn();

function post(body: unknown) {
  return new Request('https://painel.example/api/workouts/rest-schedule', { method: 'POST', body: JSON.stringify(body) });
}

beforeEach(() => {
  process.env.QSTASH_TOKEN = 'test-token';
  process.env.QSTASH_CURRENT_SIGNING_KEY = 'k1';
  process.env.QSTASH_NEXT_SIGNING_KEY = 'k2';
  process.env.NEXT_PUBLIC_APP_URL = 'https://painel.example/';
  vi.mocked(getSessionContext).mockResolvedValue({ supabase: userClient, user: { id: `user-${Math.random()}` }, workspaceId: 'ws' } as never);
  publishJSON.mockReset().mockResolvedValue({ messageId: 'msg-1' });
  vi.mocked(getQStashClient).mockReturnValue({ publishJSON } as never);
  vi.mocked(scheduleRestAlert).mockReset();
});

describe('POST /api/workouts/rest-schedule', () => {
  it('exige login', async () => {
    vi.mocked(getSessionContext).mockResolvedValueOnce(null);
    expect((await POST(post({ sessionId: SESSION_ID }))).status).toBe(401);
    expect(scheduleRestAlert).not.toHaveBeenCalled();
  });

  it('aceita só { sessionId } — prazo, geração e destinatário nunca vêm do cliente', async () => {
    expect((await POST(post({ sessionId: SESSION_ID, endsAt: '2026-10-26T15:01:30Z' }))).status).toBe(400);
    expect((await POST(post({ sessionId: 'nao-e-uuid' }))).status).toBe(400);
    expect(scheduleRestAlert).not.toHaveBeenCalled();
  });

  it('agenda usando o cliente do usuário (RLS) e a URL pública do callback', async () => {
    vi.mocked(scheduleRestAlert).mockImplementationOnce(async (deps) => {
      await deps.publish({ url: deps.callbackUrl } as PublishRequest);
      return { scheduled: true, messageId: 'msg-1', notBefore: 1 };
    });
    const res = await POST(post({ sessionId: SESSION_ID }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scheduled: true, messageId: 'msg-1', notBefore: 1 });
    const [deps, sessionId] = vi.mocked(scheduleRestAlert).mock.calls[0];
    expect(sessionId).toBe(SESSION_ID);
    expect(deps.db).toBe(userClient);
    expect(deps.callbackUrl).toBe('https://painel.example/api/workouts/rest-callback');
    expect(publishJSON).toHaveBeenCalledWith({ url: 'https://painel.example/api/workouts/rest-callback' });
  });

  it('sem credenciais do QStash falha de forma explícita (503), sem fingir que agendou', async () => {
    delete process.env.QSTASH_TOKEN;
    const res = await POST(post({ sessionId: SESSION_ID }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ reason: 'not_configured' });
    expect(scheduleRestAlert).not.toHaveBeenCalled();
  });

  it('na Vercel, o callback usa o domínio de produção da plataforma', async () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'painelpessoallucas.vercel.app';
    vi.mocked(scheduleRestAlert).mockResolvedValueOnce({ scheduled: false, reason: 'rest_not_running' });
    await POST(post({ sessionId: SESSION_ID }));
    expect(vi.mocked(scheduleRestAlert).mock.calls[0][0].callbackUrl).toBe('https://painelpessoallucas.vercel.app/api/workouts/rest-callback');
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  });

  it('sem URL pública conhecida também fica indisponível (não chuta endereço)', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    expect((await POST(post({ sessionId: SESSION_ID }))).status).toBe(503);
  });

  it('falha de conexão com o QStash responde 502 sem vazar detalhes', async () => {
    vi.mocked(scheduleRestAlert).mockRejectedValueOnce(new Error('fetch failed: token xyz'));
    const res = await POST(post({ sessionId: SESSION_ID }));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain('xyz');
  });

  it('falha do banco também responde 502', async () => {
    vi.mocked(scheduleRestAlert).mockRejectedValueOnce(new RestAlertInfraError('db'));
    expect((await POST(post({ sessionId: SESSION_ID }))).status).toBe(502);
  });

  it('decisão de não agendar (ex.: preferência desligada) volta com o motivo', async () => {
    vi.mocked(scheduleRestAlert).mockResolvedValueOnce({ scheduled: false, reason: 'no_enabled_device' });
    expect(await (await POST(post({ sessionId: SESSION_ID }))).json()).toEqual({ scheduled: false, reason: 'no_enabled_device' });
  });
});

describe('GET /api/workouts/rest-schedule — estado para a interface', () => {
  it('informa se o servidor está pronto e para quem vão os avisos do atleta', async () => {
    vi.mocked(athleteLinkFor).mockResolvedValueOnce('mine');
    const res = await GET(new Request(`https://painel.example/api/workouts/rest-schedule?athleteId=${ATHLETE_ID}`));
    expect(await res.json()).toEqual({ ready: true, athlete: 'mine' });
    expect(vi.mocked(athleteLinkFor).mock.calls[0][0]).toBe(userClient);
  });

  it('ready=false quando o QStash não está configurado', async () => {
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    vi.mocked(athleteLinkFor).mockResolvedValueOnce('unlinked');
    const res = await GET(new Request(`https://painel.example/api/workouts/rest-schedule?athleteId=${ATHLETE_ID}`));
    expect(await res.json()).toEqual({ ready: false, athlete: 'unlinked' });
  });

  it('atleta fora do workspace: 404; id inválido: 400', async () => {
    vi.mocked(athleteLinkFor).mockResolvedValueOnce(null);
    expect((await GET(new Request(`https://painel.example/api/workouts/rest-schedule?athleteId=${ATHLETE_ID}`))).status).toBe(404);
    expect((await GET(new Request('https://painel.example/api/workouts/rest-schedule?athleteId=x'))).status).toBe(400);
  });
});

// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/platform/supabase/session', () => ({ getSessionContext: async () => null }));
vi.mock('next/headers', () => ({ cookies: async () => ({ set: () => {}, get: () => undefined, delete: () => {} }) }));

import { GET as googleStatus } from '@/app/api/integrations/google/status/route';
import { GET as googleConnect } from '@/app/api/integrations/google/connect/route';
import { GET as googleCallback } from '@/app/api/integrations/google/callback/route';
import { POST as googleDisconnect } from '@/app/api/integrations/google/disconnect/route';
import { GET as calendarToday } from '@/app/api/integrations/calendar/today/route';
import { POST as gmailSend } from '@/app/api/integrations/gmail/send-digest/route';
import { GET as digestGet, PUT as digestPut } from '@/app/api/settings/digest/route';
import { googleIntegrationsDisabled } from '@/platform/integrations/feature-flags';

/**
 * Desativação reversível de Google Calendar/Gmail: com a flag ligada as rotas
 * respondem 410 sem ler sessão, tokens nem dados. Sem a flag, o comportamento
 * é o de sempre. O login com Google (Supabase Auth, /auth/callback) não passa
 * por nenhuma destas rotas.
 */

const req = () => new Request('http://localhost/api/x?service=calendar');

afterEach(() => vi.unstubAllEnvs());

describe('GOOGLE_INTEGRATIONS_DISABLED', () => {
  it('desligada por padrão', () => {
    expect(googleIntegrationsDisabled()).toBe(false);
  });

  it('com a flag, todas as rotas das integrações respondem 410', async () => {
    vi.stubEnv('GOOGLE_INTEGRATIONS_DISABLED', 'true');
    const calls = [
      googleStatus(req()), googleConnect(req()), googleCallback(req()), googleDisconnect(req()),
      calendarToday(req()), gmailSend(req()), digestGet(), digestPut(req()),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(410);
  });

  it('sem a flag, as rotas seguem o fluxo normal (aqui: sem sessão => 401)', async () => {
    const res = await googleStatus(req());
    expect(res.status).toBe(401);
  });
});

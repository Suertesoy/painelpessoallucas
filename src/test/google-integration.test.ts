// @vitest-environment node
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

/**
 * Testes da integração Google sem chamadas reais:
 * - criptografia AES-256-GCM dos tokens
 * - renovação de token (rotação) e tratamento de revogação com fetch mock
 *
 * 'server-only' é mockado (vitest roda fora do runtime React Server).
 */
vi.mock('server-only', () => ({}));

const KEY_B64 = Buffer.alloc(32, 7).toString('base64');

describe('Criptografia de tokens (AES-256-GCM)', () => {
  beforeEach(() => {
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = KEY_B64;
  });

  it('cifra e decifra um token (round-trip)', async () => {
    const { encryptToken, decryptToken } = await import(
      '@/platform/integrations/token-crypto'
    );
    const token = 'ya29.a0AfB_secreto_de_teste';
    const encrypted = encryptToken(token);
    expect(encrypted).not.toContain(token);
    expect(encrypted.startsWith('v1.')).toBe(true);
    expect(decryptToken(encrypted)).toBe(token);
  });

  it('produz ciphertexts diferentes para o mesmo token (IV aleatório)', async () => {
    const { encryptToken } = await import('@/platform/integrations/token-crypto');
    expect(encryptToken('mesmo')).not.toBe(encryptToken('mesmo'));
  });

  it('rejeita payload adulterado', async () => {
    const { encryptToken, decryptToken } = await import(
      '@/platform/integrations/token-crypto'
    );
    const encrypted = encryptToken('dado');
    const parts = encrypted.split('.');
    parts[3] = parts[3].slice(0, -4) + 'AAAA';
    expect(() => decryptToken(parts.join('.'))).toThrow();
  });

  it('falha claramente sem a chave configurada', async () => {
    delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    const { encryptToken } = await import('@/platform/integrations/token-crypto');
    expect(() => encryptToken('x')).toThrow('GOOGLE_TOKEN_ENCRYPTION_KEY');
  });
});

describe('Renovação e revogação de token Google (fetch mock)', () => {
  beforeEach(() => {
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = KEY_B64;
    process.env.GOOGLE_CLIENT_ID = 'client-id-teste';
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret-teste';
    process.env.GOOGLE_REDIRECT_URI = 'https://exemplo.dev/api/integrations/google/callback';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeAdminMock(tokenRow: Record<string, unknown> | null) {
    const updates: Record<string, unknown>[] = [];
    const admin = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: tokenRow, error: null }),
          }),
        }),
        update: (values: Record<string, unknown>) => ({
          eq: async () => {
            updates.push({ table, ...values });
            return { error: null };
          },
        }),
      }),
    };
    return { admin, updates };
  }

  it('renova access token expirado e rotaciona os tokens armazenados', async () => {
    const { encryptToken } = await import('@/platform/integrations/token-crypto');
    const { getValidAccessToken } = await import(
      '@/platform/integrations/google-client'
    );

    const tokenRow = {
      access_token_encrypted: encryptToken('access-antigo'),
      refresh_token_encrypted: encryptToken('refresh-valido'),
      access_token_expires_at: new Date(Date.now() - 1000).toISOString(), // expirado
    };
    const { admin, updates } = makeAdminMock(tokenRow);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            access_token: 'access-novo',
            expires_in: 3600,
            token_type: 'Bearer',
            scope: 'x',
          }),
          { status: 200 }
        )
      )
    );

    const token = await getValidAccessToken(
      admin as never,
      'account-1'
    );
    expect(token).toBe('access-novo');
    // rotação persistida
    expect(updates.some((u) => 'access_token_encrypted' in u)).toBe(true);
  });

  it('usa o access token atual quando ainda é válido (sem chamadas de rede)', async () => {
    const { encryptToken } = await import('@/platform/integrations/token-crypto');
    const { getValidAccessToken } = await import(
      '@/platform/integrations/google-client'
    );

    const tokenRow = {
      access_token_encrypted: encryptToken('access-valido'),
      refresh_token_encrypted: encryptToken('refresh'),
      access_token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    };
    const { admin } = makeAdminMock(tokenRow);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const token = await getValidAccessToken(admin as never, 'account-1');
    expect(token).toBe('access-valido');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('marca a conta como revogada em invalid_grant e lança erro claro', async () => {
    const { encryptToken } = await import('@/platform/integrations/token-crypto');
    const { getValidAccessToken, GoogleTokenRevokedError } = await import(
      '@/platform/integrations/google-client'
    );

    const tokenRow = {
      access_token_encrypted: encryptToken('expirado'),
      refresh_token_encrypted: encryptToken('refresh-revogado'),
      access_token_expires_at: new Date(Date.now() - 1000).toISOString(),
    };
    const { admin, updates } = makeAdminMock(tokenRow);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
      )
    );

    await expect(getValidAccessToken(admin as never, 'account-1')).rejects.toBeInstanceOf(
      GoogleTokenRevokedError
    );
    expect(updates.some((u) => u.status === 'revoked')).toBe(true);
  });

  it('monta a URL de autorização com scopes mínimos e access_type=offline', async () => {
    const { buildGoogleAuthUrl, GOOGLE_SCOPES } = await import(
      '@/platform/integrations/google-client'
    );
    const url = buildGoogleAuthUrl('calendar', 'state-xyz');
    expect(url).toContain('access_type=offline');
    expect(url).toContain('prompt=consent');
    expect(url).toContain('state=state-xyz');
    expect(url).toContain(encodeURIComponent('calendar.app.created'));
    // scopes mínimos: nada de acesso total ao calendário
    expect(GOOGLE_SCOPES.calendar.join(' ')).not.toContain('auth/calendar ');
    expect(GOOGLE_SCOPES.gmail).toContain('https://www.googleapis.com/auth/gmail.send');
    expect(GOOGLE_SCOPES.gmail.join(' ')).not.toContain('gmail.readonly');
  });
});

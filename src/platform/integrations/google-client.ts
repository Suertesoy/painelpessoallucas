import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { encryptToken, decryptToken, tokenFingerprint } from './token-crypto';

/**
 * Cliente OAuth 2.0 / APIs Google — exclusivamente servidor.
 *
 * - Authorization Code + access_type=offline (refresh token).
 * - Scopes mínimos por serviço (login da aplicação NÃO passa por aqui).
 * - Tokens criptografados em integration_tokens (tabela sem policy de
 *   cliente; somente o admin client do servidor acessa).
 * - Rotação de access token com tratamento de revogação (invalid_grant).
 */

export type GoogleService = 'calendar' | 'gmail';

export const GOOGLE_SCOPES: Record<GoogleService, string[]> = {
  // Mínimos: administrar somente calendários criados pela app + disponibilidade.
  calendar: [
    'openid',
    'email',
    'https://www.googleapis.com/auth/calendar.app.created',
    'https://www.googleapis.com/auth/calendar.freebusy',
  ],
  // Somente envio de e-mail (sem leitura da caixa de entrada).
  gmail: ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send'],
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não configurada no servidor.`);
  return value;
}

export function buildGoogleAuthUrl(service: GoogleService, state: string): string {
  const params = new URLSearchParams({
    client_id: requiredEnv('GOOGLE_CLIENT_ID'),
    redirect_uri: requiredEnv('GOOGLE_REDIRECT_URI'),
    response_type: 'code',
    scope: GOOGLE_SCOPES[service].join(' '),
    access_type: 'offline',
    prompt: 'consent', // garante refresh_token também em reconexões
    include_granted_scopes: 'false',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
  id_token?: string;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleTokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: requiredEnv('GOOGLE_CLIENT_ID'),
      client_secret: requiredEnv('GOOGLE_CLIENT_SECRET'),
      redirect_uri: requiredEnv('GOOGLE_REDIRECT_URI'),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Troca de código falhou (HTTP ${res.status}): ${body.slice(0, 200)}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

export class GoogleTokenRevokedError extends Error {
  constructor() {
    super('A conexão com o Google foi revogada. Reconecte em Configurações → Integrações.');
  }
}

async function refreshGoogleToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requiredEnv('GOOGLE_CLIENT_ID'),
      client_secret: requiredEnv('GOOGLE_CLIENT_SECRET'),
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 400 && body.includes('invalid_grant')) {
      throw new GoogleTokenRevokedError();
    }
    throw new Error(`Renovação de token falhou (HTTP ${res.status})`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

export async function revokeGoogleToken(token: string): Promise<void> {
  await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  }).catch(() => {
    // Melhor esforço: revogação falha não impede a desconexão local.
  });
}

/** E-mail da conta a partir do id_token (payload JWT vindo do Google via TLS). */
export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split('.')[1];
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof json.email === 'string' ? json.email : null;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// Persistência (admin client — tabela integration_tokens sem acesso do cliente)
// ----------------------------------------------------------------------------

export async function storeIntegrationTokens(
  admin: SupabaseClient,
  accountId: string,
  workspaceId: string,
  tokens: GoogleTokenResponse
): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const row: Record<string, unknown> = {
    integration_account_id: accountId,
    workspace_id: workspaceId,
    access_token_encrypted: encryptToken(tokens.access_token),
    access_token_expires_at: expiresAt,
    token_type: tokens.token_type,
  };
  if (tokens.refresh_token) {
    row.refresh_token_encrypted = encryptToken(tokens.refresh_token);
  }
  const { error } = await admin
    .from('integration_tokens')
    .upsert(row, { onConflict: 'integration_account_id' });
  if (error) throw new Error(`Falha ao armazenar tokens: ${error.message}`);
}

/**
 * Retorna um access token válido para a conta, renovando (com rotação) se
 * necessário. Em revogação: marca a conta e lança GoogleTokenRevokedError.
 */
export async function getValidAccessToken(
  admin: SupabaseClient,
  accountId: string
): Promise<string> {
  const { data: tokenRow, error } = await admin
    .from('integration_tokens')
    .select('*')
    .eq('integration_account_id', accountId)
    .maybeSingle();
  if (error || !tokenRow) {
    throw new Error('Tokens da integração não encontrados. Reconecte a conta.');
  }

  const expiresAt = tokenRow.access_token_expires_at
    ? new Date(tokenRow.access_token_expires_at).getTime()
    : 0;
  const stillValid = expiresAt - Date.now() > 60_000; // margem de 1 minuto

  if (stillValid) {
    return decryptToken(tokenRow.access_token_encrypted);
  }

  if (!tokenRow.refresh_token_encrypted) {
    await markAccountRevoked(admin, accountId, 'Sem refresh token disponível');
    throw new GoogleTokenRevokedError();
  }

  const refreshToken = decryptToken(tokenRow.refresh_token_encrypted);
  try {
    const refreshed = await refreshGoogleToken(refreshToken);
    // Rotação: novo access token (e novo refresh token, se o Google enviar).
    const update: Record<string, unknown> = {
      access_token_encrypted: encryptToken(refreshed.access_token),
      access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    };
    if (refreshed.refresh_token) {
      update.refresh_token_encrypted = encryptToken(refreshed.refresh_token);
    }
    const { error: updateError } = await admin
      .from('integration_tokens')
      .update(update)
      .eq('integration_account_id', accountId);
    if (updateError) {
      throw new Error(`Falha ao rotacionar tokens: ${updateError.message}`);
    }
    console.info(`Google token renovado (conta ${accountId}, fp ${tokenFingerprint(refreshed.access_token)})`);
    return refreshed.access_token;
  } catch (e) {
    if (e instanceof GoogleTokenRevokedError) {
      await markAccountRevoked(admin, accountId, 'Refresh token revogado (invalid_grant)');
    }
    throw e;
  }
}

async function markAccountRevoked(
  admin: SupabaseClient,
  accountId: string,
  reason: string
): Promise<void> {
  await admin
    .from('integration_accounts')
    .update({ status: 'revoked', last_error: reason })
    .eq('id', accountId);
}

/** Chamada autenticada a uma API Google. */
export async function googleApiFetch(
  accessToken: string,
  url: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
}

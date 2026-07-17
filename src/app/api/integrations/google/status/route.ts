import { NextResponse } from 'next/server';
import { getSessionContext } from '@/platform/supabase/session';
import { getSupabaseAdminClient } from '@/platform/supabase/admin-client';
import {
  getValidAccessToken,
  GoogleTokenRevokedError,
} from '@/platform/integrations/google-client';

/**
 * GET /api/integrations/google/status?service=calendar|gmail[&verify=1]
 * Status da conexão. Com verify=1 testa a renovação do token de verdade.
 * Nunca retorna tokens.
 */
export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const url = new URL(request.url);
  const service = url.searchParams.get('service');
  const verify = url.searchParams.get('verify') === '1';
  if (service !== 'calendar' && service !== 'gmail') {
    return NextResponse.json({ error: 'Serviço inválido' }, { status: 400 });
  }

  const { data: account } = await session.supabase
    .from('integration_accounts')
    .select('id, status, external_account_email, scopes, connected_at, last_verified_at, last_error')
    .eq('workspace_id', session.workspaceId)
    .eq('provider', 'google')
    .eq('service', service)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ status: 'disconnected' });
  }

  let status = account.status as string;
  let lastError = account.last_error as string | null;

  if (verify && status === 'connected') {
    try {
      const admin = getSupabaseAdminClient();
      await getValidAccessToken(admin, account.id);
      await session.supabase
        .from('integration_accounts')
        .update({ last_verified_at: new Date().toISOString(), last_error: null })
        .eq('id', account.id);
      lastError = null;
    } catch (e) {
      status = e instanceof GoogleTokenRevokedError ? 'revoked' : 'error';
      lastError = e instanceof Error ? e.message : 'erro desconhecido';
      await session.supabase
        .from('integration_accounts')
        .update({ status, last_error: lastError })
        .eq('id', account.id);
    }
  }

  return NextResponse.json({
    status,
    email: account.external_account_email,
    scopes: account.scopes,
    connectedAt: account.connected_at,
    lastVerifiedAt: verify ? new Date().toISOString() : account.last_verified_at,
    lastError,
  });
}

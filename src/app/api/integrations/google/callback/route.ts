import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionContext } from '@/platform/supabase/session';
import { getSupabaseAdminClient } from '@/platform/supabase/admin-client';
import {
  exchangeGoogleCode,
  emailFromIdToken,
  storeIntegrationTokens,
  type GoogleService,
} from '@/platform/integrations/google-client';

/**
 * GET /api/integrations/google/callback
 * Conclui o OAuth: valida state, troca o código, criptografa e armazena os
 * tokens no servidor. Nenhum token é retornado ao navegador.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirect = (params: string) =>
    NextResponse.redirect(new URL(`/configuracoes?${params}`, url.origin));

  const session = await getSessionContext();
  if (!session) {
    return NextResponse.redirect(new URL('/login', url.origin));
  }

  const cookieStore = await cookies();
  const stateCookie = cookieStore.get('g_oauth_state')?.value;
  cookieStore.delete('g_oauth_state');

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (oauthError) {
    return redirect(`integracao_erro=${encodeURIComponent(oauthError)}`);
  }
  if (!code || !state || !stateCookie) {
    return redirect('integracao_erro=fluxo_invalido');
  }

  let service: GoogleService;
  try {
    const parsed = JSON.parse(stateCookie) as { state: string; service: GoogleService };
    if (parsed.state !== state) throw new Error('state divergente');
    service = parsed.service;
  } catch {
    return redirect('integracao_erro=state_invalido');
  }

  try {
    const tokens = await exchangeGoogleCode(code);
    const email = emailFromIdToken(tokens.id_token);
    const grantedScopes = tokens.scope.split(' ');

    // Conta da integração (metadados visíveis ao cliente via RLS).
    const { data: account, error: accountError } = await session.supabase
      .from('integration_accounts')
      .upsert(
        {
          workspace_id: session.workspaceId,
          user_id: session.user.id,
          provider: 'google',
          service,
          external_account_email: email,
          scopes: grantedScopes,
          status: 'connected',
          last_error: null,
          connected_at: new Date().toISOString(),
        },
        { onConflict: 'workspace_id,provider,service' }
      )
      .select('id')
      .single();
    if (accountError || !account) {
      throw new Error(accountError?.message ?? 'Falha ao registrar a conexão');
    }

    // Tokens criptografados (tabela inacessível ao cliente).
    const admin = getSupabaseAdminClient();
    await storeIntegrationTokens(admin, account.id, session.workspaceId, tokens);

    return redirect(`integracao_ok=${service}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'erro desconhecido';
    return redirect(`integracao_erro=${encodeURIComponent(message.slice(0, 120))}`);
  }
}

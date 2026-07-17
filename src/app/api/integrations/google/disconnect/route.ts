import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/platform/supabase/session';
import { getSupabaseAdminClient } from '@/platform/supabase/admin-client';
import { revokeGoogleToken } from '@/platform/integrations/google-client';
import { decryptToken } from '@/platform/integrations/token-crypto';

/**
 * POST /api/integrations/google/disconnect  { service }
 * Revoga o token no Google (melhor esforço) e remove a conexão local.
 */
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const parsed = z
    .object({ service: z.enum(['calendar', 'gmail']) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Serviço inválido' }, { status: 400 });
  }

  const { data: account } = await session.supabase
    .from('integration_accounts')
    .select('id')
    .eq('workspace_id', session.workspaceId)
    .eq('provider', 'google')
    .eq('service', parsed.data.service)
    .maybeSingle();
  if (!account) {
    return NextResponse.json({ status: 'disconnected' });
  }

  const admin = getSupabaseAdminClient();

  // Revogação no Google (melhor esforço, sem expor tokens).
  const { data: tokenRow } = await admin
    .from('integration_tokens')
    .select('refresh_token_encrypted, access_token_encrypted')
    .eq('integration_account_id', account.id)
    .maybeSingle();
  if (tokenRow) {
    try {
      const token = tokenRow.refresh_token_encrypted
        ? decryptToken(tokenRow.refresh_token_encrypted)
        : decryptToken(tokenRow.access_token_encrypted);
      await revokeGoogleToken(token);
    } catch {
      // chave trocada/registro corrompido: segue com a remoção local
    }
  }

  await admin.from('integration_tokens').delete().eq('integration_account_id', account.id);
  await session.supabase
    .from('integration_accounts')
    .update({ status: 'disconnected', last_error: null })
    .eq('id', account.id);

  return NextResponse.json({ status: 'disconnected' });
}

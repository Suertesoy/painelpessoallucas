import { getSupabaseServerClient } from './server-client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

/**
 * Resolve o usuário autenticado e seu workspace no servidor.
 * Toda mutação de API valida sessão + associação ao workspace por aqui —
 * nunca aceita workspace_id arbitrário do cliente.
 */
export interface SessionContext {
  supabase: SupabaseClient;
  user: User;
  workspaceId: string;
}

export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  return { supabase, user, workspaceId: membership.workspace_id };
}

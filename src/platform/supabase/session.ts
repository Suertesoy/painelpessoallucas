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

  // Mesma regra de public.ensure_personal_workspace(): o workspace padrão do
  // perfil (se o usuário ainda for membro dele); senão o membership mais antigo.
  const { data: profile } = await supabase
    .from('profiles')
    .select('default_workspace_id')
    .eq('id', user.id)
    .maybeSingle();
  const preferred = profile?.default_workspace_id as string | null | undefined;
  if (preferred) {
    const { data: preferredMembership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('workspace_id', preferred)
      .maybeSingle();
    if (preferredMembership) return { supabase, user, workspaceId: preferredMembership.workspace_id };
  }

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

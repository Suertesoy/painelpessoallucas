import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/platform/supabase/server-client';

/**
 * GET /api/debug/sync-status — diagnóstico temporário (Fase 2, investigação
 * de sincronização mobile). Roda os passos da sessão do SERVIDOR
 * separadamente (usuário → membership → workspace → contagem de projetos),
 * para que cada camada apareça isolada no resultado em vez de um único
 * booleano "funcionou/não funcionou".
 *
 * Nunca retorna e-mail completo, UUID completo, JWT, cookies, tokens,
 * headers ou a resposta bruta do Supabase — só booleanos, uma contagem e uma
 * categoria de erro genérica.
 *
 * Remover esta rota depois que a causa da falta de sincronização no celular
 * for identificada e corrigida.
 */

type ErrorCategory =
  | 'none'
  | 'unauthenticated'
  | 'workspace_not_found'
  | 'membership_not_found'
  | 'permission_denied'
  | 'network_error'
  | 'query_error'
  | 'unknown';

export interface SyncStatusBody {
  serverAuthenticated: boolean;
  serverUserResolved: boolean;
  serverWorkspaceResolved: boolean;
  serverMembershipFound: boolean;
  serverProjectsQueryExecuted: boolean;
  serverProjectsQueryStatus: 'success' | 'error';
  serverProjectCount: number | null;
  serverErrorCategory: ErrorCategory;
}

function categorizePostgrestError(err: { code?: string } | null | undefined): ErrorCategory {
  if (!err) return 'unknown';
  // 42501 = insufficient_privilege (SQLSTATE) — falha de GRANT/RLS.
  if (err.code === '42501') return 'permission_denied';
  return 'query_error';
}

export async function GET() {
  const body: SyncStatusBody = {
    serverAuthenticated: false,
    serverUserResolved: false,
    serverWorkspaceResolved: false,
    serverMembershipFound: false,
    serverProjectsQueryExecuted: false,
    serverProjectsQueryStatus: 'error',
    serverProjectCount: null,
    serverErrorCategory: 'none',
  };

  try {
    const supabase = await getSupabaseServerClient();

    // 1. Usuário pelo cliente de servidor (valida o token, não confia só no cookie).
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    body.serverAuthenticated = true;
    body.serverUserResolved = true;

    // 2. Associação ao workspace (workspace_members), separada da resolução do workspace.
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .order('created_at')
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      body.serverErrorCategory = categorizePostgrestError(membershipError);
      return NextResponse.json(body);
    }
    if (!membership) {
      body.serverErrorCategory = 'membership_not_found';
      return NextResponse.json(body);
    }
    body.serverMembershipFound = true;

    // 3. Workspace resolvido a partir da membership.
    const workspaceId = membership.workspace_id as string | null;
    if (!workspaceId) {
      body.serverErrorCategory = 'workspace_not_found';
      return NextResponse.json(body);
    }
    body.serverWorkspaceResolved = true;

    // 4. Contagem de projetos usando a sessão real do usuário (RLS ativa).
    body.serverProjectsQueryExecuted = true;
    const { count, error: countError } = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null);

    if (countError) {
      body.serverErrorCategory = categorizePostgrestError(countError);
      return NextResponse.json(body);
    }

    body.serverProjectsQueryStatus = 'success';
    body.serverProjectCount = count ?? 0;
    body.serverErrorCategory = 'none';
    return NextResponse.json(body);
  } catch (e) {
    // 5. Qualquer falha inesperada (rede, etc.) é classificada sem detalhes internos.
    body.serverErrorCategory =
      e instanceof TypeError ? 'network_error' : 'unknown';
    return NextResponse.json(body);
  }
}

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Compartilhamento do workspace doméstico (convite por e-mail).
 *
 * Toda a regra de segurança vive no banco (funções SECURITY DEFINER em
 * 20260817100000_workspace_invites.sql): aqui só chamamos as RPCs e
 * traduzimos mensagens. O token do convite nunca é guardado no cliente.
 */

export interface WorkspaceMember {
  userId: string;
  email: string;
  role: 'owner' | 'member';
}

export interface WorkspaceInvite {
  id: string;
  email: string;
  expiresAt: string;
  acceptedAt: string | null;
}

const INVITE_PATH = '/convite';

function friendly(message: string | undefined): string {
  if (!message) return 'Algo deu errado. Tente novamente.';
  if (/does not exist|schema cache|PGRST202|42883/i.test(message)) {
    return 'O compartilhamento ainda não está disponível: a atualização do banco de dados não foi aplicada.';
  }
  // Mensagens das funções do banco já são em português e seguras para exibir.
  const known = [
    'Convite inválido ou expirado.',
    'Este workspace já tem o máximo de 2 pessoas.',
    'Apenas quem administra o workspace pode convidar.',
    'E-mail inválido.',
    'Não autenticado',
  ];
  return known.find((k) => message.includes(k)) ?? 'Não foi possível concluir. Tente novamente.';
}

export function buildInviteLink(origin: string, token: string): string {
  return `${origin}${INVITE_PATH}/${token}`;
}

export class SharingService {
  constructor(private supabase: SupabaseClient, private workspaceId: string) {}

  /** Cria um convite para o e-mail e devolve o link (o token só existe aqui, uma vez). */
  async createInvite(email: string, origin: string): Promise<string> {
    const { data, error } = await this.supabase.rpc('create_workspace_invite', {
      p_workspace_id: this.workspaceId,
      p_email: email,
    });
    if (error || typeof data !== 'string') throw new Error(friendly(error?.message));
    return buildInviteLink(origin, data);
  }

  async revokeInvite(inviteId: string): Promise<void> {
    const { error } = await this.supabase.rpc('revoke_workspace_invite', { p_invite_id: inviteId });
    if (error) throw new Error(friendly(error.message));
  }

  /** Aceita o convite com a conta autenticada. Devolve o id do workspace compartilhado. */
  async acceptInvite(token: string): Promise<string> {
    const { data, error } = await this.supabase.rpc('accept_workspace_invite', { p_token: token });
    if (error || typeof data !== 'string') throw new Error(friendly(error?.message));
    return data;
  }

  async listMembers(): Promise<WorkspaceMember[]> {
    const { data, error } = await this.supabase.rpc('list_workspace_members', { p_workspace_id: this.workspaceId });
    if (error) throw new Error(friendly(error.message));
    return ((data ?? []) as { user_id: string; email: string; role: 'owner' | 'member' }[]).map((m) => ({
      userId: m.user_id, email: m.email, role: m.role,
    }));
  }

  /** Só o owner enxerga convites; para os demais devolve lista vazia. */
  async listInvites(): Promise<WorkspaceInvite[]> {
    const { data, error } = await this.supabase.rpc('list_workspace_invites', { p_workspace_id: this.workspaceId });
    if (error) return [];
    return ((data ?? []) as { id: string; email: string; expires_at: string; accepted_at: string | null }[])
      .filter((i) => i.accepted_at === null)
      .map((i) => ({ id: i.id, email: i.email, expiresAt: i.expires_at, acceptedAt: i.accepted_at }));
  }
}

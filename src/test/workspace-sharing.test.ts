// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SharingService, buildInviteLink } from '@/modules/sharing/application/sharing.service';

const SQL = readFileSync(join(process.cwd(), 'supabase/migrations/20261015090000_workspace_invites.sql'), 'utf8');

/** Garantias de segurança da migration de convites (conteúdo versionado). */
describe('migration de convites — segurança', () => {
  it('só o hash do token é guardado e a tabela é fechada (RLS sem policies, sem grants)', () => {
    expect(SQL).toMatch(/token_hash text not null unique/);
    expect(SQL).not.toMatch(/\btoken text\b/);
    expect(SQL).toMatch(/alter table public\.workspace_invites enable row level security/);
    expect(SQL).toMatch(/revoke all on public\.workspace_invites from anon, authenticated/);
    expect(SQL).not.toMatch(/create policy[^;]*workspace_invites/);
    expect(SQL).not.toMatch(/grant [^;]* on public\.workspace_invites/);
  });

  it('convite expira, é de uso único e amarrado ao e-mail confirmado', () => {
    expect(SQL).toMatch(/interval '7 days'/);
    expect(SQL).toMatch(/accepted_at is null/);
    expect(SQL).toMatch(/expires_at > now\(\)/);
    expect(SQL).toMatch(/email_confirmed_at is not null/);
    expect(SQL).toMatch(/inv\.email <> v_email/);
  });

  it('só owner cria/revoga/lista convites e há limite de 2 pessoas', () => {
    expect((SQL.match(/m\.role = 'owner'/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(SQL).toMatch(/>= 2 then/);
  });

  it('funções SECURITY DEFINER com search_path fixo e EXECUTE só para authenticated', () => {
    const fns = ['create_workspace_invite(uuid, text)', 'accept_workspace_invite(text)', 'list_workspace_members(uuid)', 'list_workspace_invites(uuid)', 'revoke_workspace_invite(uuid)'];
    for (const fn of fns) {
      expect(SQL).toContain(`revoke execute on function public.${fn} from public, anon`);
      expect(SQL).toContain(`grant execute on function public.${fn} to authenticated`);
    }
    expect((SQL.match(/security definer/g) ?? []).length).toBe(6);
    expect((SQL.match(/set search_path = public/g) ?? []).length).toBe(6);
  });

  it('não é destrutiva: sem drop/delete de dados existentes e workspaces de terceiros intocados', () => {
    expect(SQL).not.toMatch(/drop (table|column)/i);
    expect(SQL).not.toMatch(/truncate/i);
    // O único delete é de convites pendentes (do próprio e-mail) e na revogação.
    const deletes = SQL.match(/delete from [a-z_.]+/gi) ?? [];
    expect(deletes.every((d) => d.includes('workspace_invites'))).toBe(true);
    expect(SQL).toMatch(/add column if not exists default_workspace_id/);
  });

  it('workspace padrão só vale se o usuário ainda for membro; senão mantém o mais antigo', () => {
    expect(SQL).toMatch(/p\.default_workspace_id is not null\s+and exists/);
    expect(SQL).toMatch(/order by m\.created_at\s+limit 1/);
  });
});

function fakeSupabase(result: { data?: unknown; error?: { message: string } | null }) {
  const rpc = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  return { rpc, client: { rpc } as never };
}

describe('SharingService', () => {
  it('createInvite devolve o link com o token e nunca o guarda', async () => {
    const { rpc, client } = fakeSupabase({ data: 'abc123' });
    const svc = new SharingService(client, 'ws-1');
    const link = await svc.createInvite('matheus@example.com', 'https://painel.app');
    expect(link).toBe('https://painel.app/convite/abc123');
    expect(rpc).toHaveBeenCalledWith('create_workspace_invite', { p_workspace_id: 'ws-1', p_email: 'matheus@example.com' });
    expect(JSON.stringify(svc)).not.toContain('abc123');
  });

  it('traduz erros do banco sem vazar detalhes internos', async () => {
    const svc = new SharingService(fakeSupabase({ error: { message: 'Convite inválido ou expirado.' } }).client, 'ws-1');
    await expect(svc.acceptInvite('x')).rejects.toThrow('Convite inválido ou expirado.');

    const raw = new SharingService(fakeSupabase({ error: { message: 'duplicate key value violates unique constraint "foo_idx"' } }).client, 'ws-1');
    await expect(raw.acceptInvite('x')).rejects.toThrow('Não foi possível concluir. Tente novamente.');

    const missing = new SharingService(fakeSupabase({ error: { message: 'function public.accept_workspace_invite(text) does not exist' } }).client, 'ws-1');
    await expect(missing.acceptInvite('x')).rejects.toThrow(/ainda não está disponível/);
  });

  it('listInvites mostra só pendentes e devolve vazio para quem não administra', async () => {
    const ok = new SharingService(fakeSupabase({ data: [
      { id: '1', email: 'a@x.com', expires_at: '2026-12-01T00:00:00Z', accepted_at: null },
      { id: '2', email: 'b@x.com', expires_at: '2026-12-01T00:00:00Z', accepted_at: '2026-11-01T00:00:00Z' },
    ] }).client, 'ws-1');
    expect((await ok.listInvites()).map((i) => i.id)).toEqual(['1']);

    const denied = new SharingService(fakeSupabase({ error: { message: 'Apenas quem administra o workspace pode ver convites.' } }).client, 'ws-1');
    expect(await denied.listInvites()).toEqual([]);
  });

  it('buildInviteLink monta o caminho esperado pela rota /convite/[token]', () => {
    expect(buildInviteLink('http://localhost:3000', 't')).toBe('http://localhost:3000/convite/t');
  });
});

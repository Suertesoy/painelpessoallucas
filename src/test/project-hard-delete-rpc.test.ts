// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { SupabaseProjectRepository } from '@/modules/projects/infrastructure/supabase-project.repository';

/**
 * Repositório/cliente da exclusão permanente — mesmo padrão de
 * finance-confirm-import.test.ts: a atomicidade e as garantias de
 * consistência (plan_actions corrigido antes do delete, evento antes do
 * delete, guarda "só arquivado") vivem na função `delete_project_permanently`
 * (Postgres), verificadas estaticamente em
 * project-hard-delete-migration.test.ts. Aqui testamos só que o repositório
 * chama a RPC certa e trata erro/sucesso corretamente.
 */

const PROJECT_ID = '00000000-0000-4000-8000-000000000099';

function makeFakeSupabaseWithRpc(rpcImpl: () => Promise<{ data: unknown; error: unknown }>) {
  return { rpc: vi.fn(rpcImpl) };
}

const NOOP_NOTIFIER = { notify: vi.fn(), subscribe: () => () => {} };

describe('SupabaseProjectRepository.deletePermanently', () => {
  it('chama a RPC delete_project_permanently com o id do projeto', async () => {
    const supabase = makeFakeSupabaseWithRpc(async () => ({ data: null, error: null }));
    const repo = new SupabaseProjectRepository(supabase as never, 'ws-1', NOOP_NOTIFIER as never);

    await repo.deletePermanently(PROJECT_ID);

    expect(supabase.rpc).toHaveBeenCalledWith('delete_project_permanently', { p_project_id: PROJECT_ID });
  });

  it('notifica os assinantes reativos após sucesso', async () => {
    const supabase = makeFakeSupabaseWithRpc(async () => ({ data: null, error: null }));
    const repo = new SupabaseProjectRepository(supabase as never, 'ws-1', NOOP_NOTIFIER as never);

    await repo.deletePermanently(PROJECT_ID);

    expect(NOOP_NOTIFIER.notify).toHaveBeenCalled();
  });

  it('propaga erro da RPC como mensagem segura em português (ex.: guarda "só arquivado" no servidor)', async () => {
    const supabase = makeFakeSupabaseWithRpc(async () => ({
      data: null,
      error: { message: 'Só é possível excluir permanentemente um projeto arquivado' },
    }));
    const repo = new SupabaseProjectRepository(supabase as never, 'ws-1', NOOP_NOTIFIER as never);

    await expect(repo.deletePermanently(PROJECT_ID)).rejects.toThrow(/Não foi possível excluir o projeto/);
  });
});

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSessionContext } from '@/platform/supabase/session';
import { GET, PUT } from '@/app/api/settings/routine/route';

/**
 * GET/PUT /api/settings/routine — qual projeto ocupa "Projeto principal" e
 * "Frente secundária". Vive em workspace_settings; o upsert só toca as duas
 * colunas de rotina. PUT valida que os projetos pertencem ao workspace da
 * sessão antes de gravar (nunca aceita um projeto de outro workspace).
 */

vi.mock('@/platform/supabase/session', () => ({ getSessionContext: vi.fn() }));

function fakeSupabase(opts: {
  storedPrimary?: string | null;
  storedSecondary?: string | null;
  ownedProjectIds?: string[];
  onUpsert?: (v: unknown, options?: unknown) => void;
  upsertError?: { message: string } | null;
}) {
  return {
    from: (table: string) => {
      if (table === 'workspace_settings') {
        return {
          select: () => {
            const chain: Record<string, unknown> = {};
            chain.eq = () => chain;
            chain.maybeSingle = async () => ({
              data:
                opts.storedPrimary === undefined && opts.storedSecondary === undefined
                  ? null
                  : {
                      routine_primary_project_id: opts.storedPrimary ?? null,
                      routine_secondary_project_id: opts.storedSecondary ?? null,
                    },
              error: null,
            });
            return chain;
          },
          upsert: (v: unknown, upsertOptions: unknown) => {
            opts.onUpsert?.(v, upsertOptions);
            return Promise.resolve({ error: opts.upsertError ?? null });
          },
        };
      }
      if (table === 'projects') {
        return {
          select: () => {
            const chain: Record<string, unknown> = {};
            chain.eq = () => chain;
            chain.in = (_col: string, ids: string[]) => {
              const owned = opts.ownedProjectIds ?? [];
              return Promise.resolve({
                data: ids.filter((id) => owned.includes(id)).map((id) => ({ id })),
                error: null,
              });
            };
            return chain;
          },
        };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  };
}

function putRequest(body: unknown): Request {
  return new Request('http://x/api/settings/routine', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const PROJECT_A = '11111111-1111-4111-8111-111111111111';
const PROJECT_B = '22222222-2222-4222-8222-222222222222';
const FOREIGN_PROJECT = '99999999-9999-4999-8999-999999999999';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/settings/routine', () => {
  it('rejeita sem sessão (401)', async () => {
    vi.mocked(getSessionContext).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('retorna null quando nenhum papel foi atribuído ainda', async () => {
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({}) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ primaryProjectId: null, secondaryProjectId: null });
  });

  it('retorna os projetos persistidos', async () => {
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({ storedPrimary: PROJECT_A, storedSecondary: PROJECT_B }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ primaryProjectId: PROJECT_A, secondaryProjectId: PROJECT_B });
  });
});

describe('PUT /api/settings/routine', () => {
  it('rejeita sem sessão (401)', async () => {
    vi.mocked(getSessionContext).mockResolvedValue(null);
    const res = await PUT(putRequest({ primaryProjectId: PROJECT_A, secondaryProjectId: null }));
    expect(res.status).toBe(401);
  });

  it('salva projetos válidos do próprio workspace, tocando somente as colunas de rotina', async () => {
    const onUpsert = vi.fn();
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({ ownedProjectIds: [PROJECT_A, PROJECT_B], onUpsert }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });
    const res = await PUT(putRequest({ primaryProjectId: PROJECT_A, secondaryProjectId: PROJECT_B }));
    expect(res.status).toBe(200);
    expect(onUpsert).toHaveBeenCalledWith(
      {
        workspace_id: 'ws-1',
        routine_primary_project_id: PROJECT_A,
        routine_secondary_project_id: PROJECT_B,
      },
      { onConflict: 'workspace_id' }
    );
  });

  it('permite limpar a atribuição (ambos null)', async () => {
    const onUpsert = vi.fn();
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({ onUpsert }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });
    const res = await PUT(putRequest({ primaryProjectId: null, secondaryProjectId: null }));
    expect(res.status).toBe(200);
    expect(onUpsert).toHaveBeenCalledWith(
      { workspace_id: 'ws-1', routine_primary_project_id: null, routine_secondary_project_id: null },
      { onConflict: 'workspace_id' }
    );
  });

  it('rejeita projeto que não pertence ao workspace da sessão (400), sem gravar', async () => {
    const onUpsert = vi.fn();
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({ ownedProjectIds: [PROJECT_A], onUpsert }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });
    const res = await PUT(putRequest({ primaryProjectId: FOREIGN_PROJECT, secondaryProjectId: null }));
    expect(res.status).toBe(400);
    expect(onUpsert).not.toHaveBeenCalled();
  });

  it('rejeita corpo inválido (400)', async () => {
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({}) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });
    const res = await PUT(putRequest({ primaryProjectId: 'não-é-uuid', secondaryProjectId: null }));
    expect(res.status).toBe(400);
  });
});

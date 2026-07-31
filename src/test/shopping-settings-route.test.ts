// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSessionContext } from '@/platform/supabase/session';
import { GET, PUT } from '@/app/api/settings/shopping/route';

/**
 * GET/PUT /api/settings/shopping — número de WhatsApp para compartilhar
 * compras. Vive em workspace_settings (mesma tabela de /api/settings/digest,
 * RLS por workspace); o upsert desta rota só toca a coluna
 * shopping_whatsapp_number.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/platform/supabase/session', () => ({ getSessionContext: vi.fn() }));

function fakeSupabase(opts: {
  storedNumber?: string | null;
  onUpsert?: (v: unknown, options?: unknown) => void;
  upsertError?: { message: string } | null;
}) {
  return {
    from: (table: string) => {
      if (table !== 'workspace_settings') throw new Error(`tabela inesperada: ${table}`);
      return {
        select: () => {
          const chain: Record<string, unknown> = {};
          chain.eq = () => chain;
          chain.maybeSingle = async () => ({
            data: opts.storedNumber === undefined ? null : { shopping_whatsapp_number: opts.storedNumber },
            error: null,
          });
          return chain;
        },
        upsert: (v: unknown, upsertOptions: unknown) => {
          opts.onUpsert?.(v, upsertOptions);
          return Promise.resolve({ error: opts.upsertError ?? null });
        },
      };
    },
  };
}

function putRequest(body: unknown): Request {
  return new Request('http://x/api/settings/shopping', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/settings/shopping', () => {
  it('rejeita sem sessão (401)', async () => {
    vi.mocked(getSessionContext).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('retorna null quando o workspace ainda não configurou um número', async () => {
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({}) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.whatsappNumber).toBeNull();
  });

  it('retorna o número persistido', async () => {
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({ storedNumber: '+55 48 98816-5106' }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });
    const res = await GET();
    const body = await res.json();
    expect(body.whatsappNumber).toBe('+55 48 98816-5106');
  });
});

describe('PUT /api/settings/shopping', () => {
  it('rejeita sem sessão (401)', async () => {
    vi.mocked(getSessionContext).mockResolvedValue(null);
    const res = await PUT(putRequest({ whatsappNumber: '+55 48 98816-5106' }));
    expect(res.status).toBe(401);
  });

  it('salva um número válido, tocando somente shopping_whatsapp_number', async () => {
    const onUpsert = vi.fn();
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({ onUpsert }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });
    const res = await PUT(putRequest({ whatsappNumber: '+55 48 98816-5106' }));
    expect(res.status).toBe(200);
    expect(onUpsert).toHaveBeenCalledWith(
      { workspace_id: 'ws-1', shopping_whatsapp_number: '+55 48 98816-5106' },
      { onConflict: 'workspace_id' }
    );
  });

  it('rejeita número inválido (400), sem gravar', async () => {
    const onUpsert = vi.fn();
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({ onUpsert }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });
    const res = await PUT(putRequest({ whatsappNumber: '123' }));
    expect(res.status).toBe(400);
    expect(onUpsert).not.toHaveBeenCalled();
  });

  it('permite limpar a configuração (null)', async () => {
    const onUpsert = vi.fn();
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({ onUpsert }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });
    const res = await PUT(putRequest({ whatsappNumber: null }));
    expect(res.status).toBe(200);
    expect(onUpsert).toHaveBeenCalledWith(
      { workspace_id: 'ws-1', shopping_whatsapp_number: null },
      { onConflict: 'workspace_id' }
    );
  });

  it('erro de gravação não expõe detalhes internos do banco', async () => {
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: fakeSupabase({
        upsertError: { message: 'duplicate key value violates unique constraint "workspace_settings_pkey"' },
      }) as never,
      user: { id: 'u1' } as never,
      workspaceId: 'ws-1',
    });
    const res = await PUT(putRequest({ whatsappNumber: '+55 48 98816-5106' }));
    expect(res.status).toBe(500);
  });
});

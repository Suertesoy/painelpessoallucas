// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

/**
 * Testes do hook useReactiveQuery — cobre exatamente o defeito diagnosticado
 * em produção: uma consulta que falha (sessão, RLS, rede) NUNCA pode virar
 * "lista vazia" silenciosa. `error` e `data` são estados distintos, e
 * `refetch` precisa repetir a consulta real (botão "Tentar novamente").
 *
 * useRepositories() é mockado: o hook só precisa de repositórios com
 * `.subscribe(listener)` — não faz nenhuma chamada real ao Supabase.
 */

const fakeRepo = { subscribe: () => () => {} };

vi.mock('@/providers/repository.provider', () => ({
  useRepositories: () => ({
    itemRepository: fakeRepo,
    projectRepository: fakeRepo,
    dailyPlanRepository: fakeRepo,
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useReactiveQuery', () => {
  it('erro na consulta não é convertido em dado vazio: error e data permanecem distintos', async () => {
    const { useReactiveQuery } = await import('@/lib/hooks');
    const queryFn = vi.fn().mockRejectedValue(new Error('permission denied for table projects'));

    const { result } = renderHook(() => useReactiveQuery(queryFn, []));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toBeUndefined();
    // dado indefinido != lista vazia: cabe ao componente decidir o que exibir
    // sabendo que houve falha, nunca tratar isso como "sem itens".
  });

  it('consulta bem-sucedida limpa erro anterior e popula os dados', async () => {
    const { useReactiveQuery } = await import('@/lib/hooks');
    const queryFn = vi.fn().mockResolvedValue([{ id: '1' }]);

    const { result } = renderHook(() => useReactiveQuery(queryFn, []));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual([{ id: '1' }]);
  });

  it('refetch executa uma nova chamada real da query (botão "Tentar novamente")', async () => {
    const { useReactiveQuery } = await import('@/lib/hooks');
    const queryFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('falha de sessão'))
      .mockResolvedValueOnce([{ id: '1' }, { id: '2' }]);

    const { result } = renderHook(() => useReactiveQuery(queryFn, []));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(queryFn).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.refetch();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.error).toBeNull());
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual([{ id: '1' }, { id: '2' }]);
  });
});

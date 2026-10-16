import { describe, it, expect } from 'vitest';
import { SupabaseFinanceCashRepository } from '@/modules/finance/cash/infrastructure/supabase-finance-cash.repository';
import { ConcurrentEditError } from '@/modules/finance/cash/infrastructure/concurrent-edit';
import { ChangeNotifier } from '@/platform/supabase/change-notifier';

/** Cliente falso que simula quantas linhas o UPDATE condicional encontrou. */
function client(matchingRows: number, balanceUpdatedAt = '2026-10-15T10:00:00Z') {
  const filters: [string, unknown][] = [];
  const chain: Record<string, unknown> = {};
  chain.update = () => chain;
  chain.eq = (k: string, v: unknown) => { filters.push([k, v]); return chain; };
  // select() termina um UPDATE (promessa) mas também inicia leituras encadeáveis (eq/maybeSingle).
  chain.select = () => Object.assign(Promise.resolve({ data: Array.from({ length: matchingRows }, () => ({ id: 'x' })), error: null }), chain);
  chain.maybeSingle = () => Promise.resolve({ data: { workspace_id: 'ws', available_cents: 100, reserve_cents: 0, available_updated_at: balanceUpdatedAt, reserve_updated_at: null }, error: null });
  const supabase = {
    from: () => chain,
    rpc: () => Promise.resolve({ data: { workspace_id: 'ws', available_cents: 1, reserve_cents: 0 }, error: null }),
  };
  return { supabase: supabase as never, filters };
}

describe('edição simultânea nas Finanças', () => {
  it('recebimento: grava quando a versão confere e usa updated_at como condição', async () => {
    const { supabase, filters } = client(1);
    const repo = new SupabaseFinanceCashRepository(supabase, 'ws', new ChangeNotifier());
    await expect(repo.updateReceivable('r1', { description: 'x' }, '2026-10-15T10:00:00Z')).resolves.toBeUndefined();
    expect(filters).toContainEqual(['updated_at', '2026-10-15T10:00:00Z']);
  });

  it('recebimento: recusa (não sobrescreve) quando outra pessoa alterou antes', async () => {
    const { supabase } = client(0);
    const repo = new SupabaseFinanceCashRepository(supabase, 'ws', new ChangeNotifier());
    await expect(repo.updateReceivable('r1', { description: 'x' }, 'antiga')).rejects.toBeInstanceOf(ConcurrentEditError);
  });

  it('compromisso: mesma proteção', async () => {
    const { supabase } = client(0);
    const repo = new SupabaseFinanceCashRepository(supabase, 'ws', new ChangeNotifier());
    await expect(
      repo.updateCommitment('c1', { description: 'x', amountCents: 1, recurrence: 'none', startMonth: '2026-10', billing: 'direct' } as never, 'antiga')
    ).rejects.toBeInstanceOf(ConcurrentEditError);
  });

  it('saldo: recusa se foi atualizado por outra pessoa; aceita se a versão confere', async () => {
    const { supabase } = client(1, '2026-10-15T10:30:00Z');
    const repo = new SupabaseFinanceCashRepository(supabase, 'ws', new ChangeNotifier());
    await expect(repo.setBalance(5000, null, { availableUpdatedAt: '2026-10-15T10:00:00Z' })).rejects.toThrow(/outra pessoa/);
    await expect(repo.setBalance(5000, null, { availableUpdatedAt: '2026-10-15T10:30:00Z' })).resolves.toBeDefined();
  });

  it('sem versão informada (ações de sistema) o comportamento anterior é mantido', async () => {
    const { supabase } = client(0);
    const repo = new SupabaseFinanceCashRepository(supabase, 'ws', new ChangeNotifier());
    await expect(repo.updateReceivable('r1', { status: 'cancelled' })).resolves.toBeUndefined();
  });
});

describe('ajuste de saldo atômico (RPC com versão)', () => {
  function rpcClient(result: { data?: unknown; error?: { code?: string; message: string } | null }) {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: { workspace_id: 'ws', available_cents: 1, reserve_cents: 0, available_updated_at: 'v', reserve_updated_at: null, updated_at: 'v' }, error: null });
    const supabase = {
      from: () => chain,
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        if (fn === 'finance_set_balance_checked') return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
        return Promise.resolve({ data: { workspace_id: 'ws', available_cents: 9, reserve_cents: 0 }, error: null });
      },
    };
    return { supabase: supabase as never, calls };
  }

  it('usa a função atômica enviando a versão lida', async () => {
    const { supabase, calls } = rpcClient({ data: { workspace_id: 'ws', available_cents: 5, reserve_cents: 0 } });
    const repo = new SupabaseFinanceCashRepository(supabase, 'ws', new ChangeNotifier());
    const b = await repo.setBalance(5, null, { updatedAt: '2026-10-15T10:00:00Z' });
    expect(b.availableCents).toBe(5);
    expect(calls[0]).toMatchObject({ fn: 'finance_set_balance_checked', args: { p_expected_version: '2026-10-15T10:00:00Z' } });
    expect(calls.some((c) => c.fn === 'finance_set_balance')).toBe(false);
  });

  it('conflito do banco (40001) vira ConcurrentEditError — nada é sobrescrito', async () => {
    const { supabase } = rpcClient({ error: { code: '40001', message: 'x' } });
    const repo = new SupabaseFinanceCashRepository(supabase, 'ws', new ChangeNotifier());
    await expect(repo.setBalance(5, null, { updatedAt: 'antiga' })).rejects.toBeInstanceOf(ConcurrentEditError);
  });

  it('migration ainda não aplicada: cai no caminho anterior (app novo + banco antigo)', async () => {
    const { supabase, calls } = rpcClient({ error: { code: 'PGRST202', message: 'not found' } });
    const repo = new SupabaseFinanceCashRepository(supabase, 'ws', new ChangeNotifier());
    await repo.setBalance(9, null, { updatedAt: 'v', availableUpdatedAt: 'v' });
    expect(calls.map((c) => c.fn)).toEqual(['finance_set_balance_checked', 'finance_set_balance']);
  });

  it('outros erros do banco não são engolidos', async () => {
    const { supabase } = rpcClient({ error: { code: '42501', message: 'denied' } });
    const repo = new SupabaseFinanceCashRepository(supabase, 'ws', new ChangeNotifier());
    await expect(repo.setBalance(5, null, { updatedAt: 'v' })).rejects.toThrow(/Não foi possível atualizar o saldo/);
  });
});

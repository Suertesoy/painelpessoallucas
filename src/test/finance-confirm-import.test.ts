// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { SupabaseFinanceRepository } from '@/modules/finance/infrastructure/supabase-finance.repository';
import { FinanceImportCommands } from '@/modules/finance/application/finance-import.commands';
import type { EventRepository } from '@/platform/events/event.repository';

/**
 * Confirmação de importação — duplo clique/retentativa não duplica (item 21
 * da lista de testes obrigatórios). A atomicidade e o bloqueio de linha em
 * si vivem na função `confirm_finance_import` (Postgres, verificada
 * estaticamente em finance-grants-migration.test.ts); aqui testamos que o
 * repositório/Command tratam a resposta da RPC corretamente e de forma
 * idempotente do ponto de vista do cliente.
 */

const WS = 'ws-1';
const IMPORT_ID = '00000000-0000-4000-8000-000000000010';
const SOURCE_ID = '00000000-0000-4000-8000-000000000011';

function makeFakeEventRepo(): EventRepository {
  return {
    save: vi.fn(async () => {}),
    findAll: vi.fn(async () => []),
    findMigrationCompletedAt: vi.fn(async () => null),
    findByEntityId: vi.fn(async () => []),
  };
}

function makeFakeSupabaseWithRpc(rpcImpl: () => Promise<{ data: unknown; error: unknown }>) {
  const importRow = {
    id: IMPORT_ID,
    workspace_id: WS,
    source_id: SOURCE_ID,
    file_name: 'extrato.csv',
    file_sha256: 'x'.repeat(64),
    format: 'csv',
    status: 'pending_review',
    row_count: 1,
    statement_start: null,
    statement_end: null,
    confirmed_at: null,
    created_at: '2026-07-31T10:00:00.000Z',
    updated_at: '2026-07-31T10:00:00.000Z',
  };
  return {
    rpc: vi.fn(rpcImpl),
    from(table: string) {
      if (table === 'finance_imports') {
        return {
          select() {
            const builder = {
              eq: () => builder,
              maybeSingle: async () => ({ data: importRow, error: null }),
            };
            return builder;
          },
        };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  };
}

const NOOP_NOTIFIER = { notify: () => {}, subscribe: () => () => {} };

describe('SupabaseFinanceRepository.confirmImport — idempotência do lado do cliente', () => {
  it('primeira confirmação cria transações e retorna alreadyConfirmed=false', async () => {
    const supabase = makeFakeSupabaseWithRpc(async () => ({
      data: [{ transaction_count: 3, already_confirmed: false }],
      error: null,
    }));
    const repo = new SupabaseFinanceRepository(supabase as never, WS, NOOP_NOTIFIER as never);

    const result = await repo.confirmImport(IMPORT_ID);
    expect(result.createdTransactionCount).toBe(3);
    expect(result.alreadyConfirmed).toBe(false);
    expect(supabase.rpc).toHaveBeenCalledWith('confirm_finance_import', { p_import_id: IMPORT_ID });
  });

  it('confirmação repetida (duplo clique/retry) retorna alreadyConfirmed=true sem erro', async () => {
    const supabase = makeFakeSupabaseWithRpc(async () => ({
      data: [{ transaction_count: 3, already_confirmed: true }],
      error: null,
    }));
    const repo = new SupabaseFinanceRepository(supabase as never, WS, NOOP_NOTIFIER as never);

    const result = await repo.confirmImport(IMPORT_ID);
    expect(result.alreadyConfirmed).toBe(true);
    expect(result.createdTransactionCount).toBe(3);
  });

  it('FinanceImportCommands só emite finance.import_confirmed na confirmação real, nunca em repetições', async () => {
    let already = false;
    const supabase = makeFakeSupabaseWithRpc(async () => {
      const result = { data: [{ transaction_count: 2, already_confirmed: already }], error: null };
      already = true;
      return result;
    });
    const repo = new SupabaseFinanceRepository(supabase as never, WS, NOOP_NOTIFIER as never);
    const eventRepo = makeFakeEventRepo();
    const commands = new FinanceImportCommands(repo, eventRepo, WS);

    await commands.confirmImport(IMPORT_ID);
    await commands.confirmImport(IMPORT_ID);
    await commands.confirmImport(IMPORT_ID);

    const confirmedEvents = (eventRepo.save as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => call[0].type === 'finance.import_confirmed'
    );
    expect(confirmedEvents).toHaveLength(1);
  });

  it('propaga erro da RPC como mensagem segura, nunca a mensagem crua do Postgres direto ao chamador sem contexto', async () => {
    const supabase = makeFakeSupabaseWithRpc(async () => ({
      data: null,
      error: { message: 'permission denied for function confirm_finance_import' },
    }));
    const repo = new SupabaseFinanceRepository(supabase as never, WS, NOOP_NOTIFIER as never);

    await expect(repo.confirmImport(IMPORT_ID)).rejects.toThrow(/Não foi possível confirmar a importação/);
  });
});

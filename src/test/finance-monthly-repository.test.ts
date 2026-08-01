// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { SupabaseFinanceRepository } from '@/modules/finance/infrastructure/supabase-finance.repository';

/**
 * Valor padrão de renda do Matheus preenchendo somente NOVOS meses, renda de
 * Lucas nunca copiada do mês anterior, e alteração do padrão nunca
 * modificando meses já criados — itens 2, 3 e 4 da lista de testes
 * obrigatórios, no nível do repositório (onde a regra realmente vive).
 */

type Row = Record<string, unknown>;

function makeFakeSupabase(initial: Record<string, Row[]> = {}) {
  const state: Record<string, Row[]> = Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, [...v]]));
  const table = (name: string) => (state[name] ??= []);
  const matches = (row: Row, filters: { col: string; val: unknown }[]) => filters.every((f) => row[f.col] === f.val);

  return {
    state,
    from(name: string) {
      const rows = table(name);
      return {
        select() {
          const filters: { col: string; val: unknown }[] = [];
          const builder = {
            eq(col: string, val: unknown) {
              filters.push({ col, val });
              return builder;
            },
            order() {
              return builder;
            },
            maybeSingle: async () => {
              const found = rows.filter((r) => matches(r, filters));
              return { data: found[0] ?? null, error: null };
            },
          };
          return builder;
        },
        insert(payload: Row) {
          const newRow: Row = {
            id: crypto.randomUUID(),
            created_at: '2026-07-31T10:00:00.000Z',
            updated_at: '2026-07-31T10:00:00.000Z',
            ...payload,
          };
          rows.push(newRow);
          return { select: () => ({ single: async () => ({ data: newRow, error: null }) }) };
        },
        update(patch: Row) {
          const filters: { col: string; val: unknown }[] = [];
          const builder = {
            eq(col: string, val: unknown) {
              filters.push({ col, val });
              return builder;
            },
            select() {
              return {
                single: async () => {
                  const found = rows.filter((r) => matches(r, filters));
                  found.forEach((r) => Object.assign(r, patch));
                  return { data: found[0], error: null };
                },
              };
            },
          };
          return builder;
        },
      };
    },
  };
}

const WS = 'ws-a';
const NOOP_NOTIFIER = { notify: () => {}, subscribe: () => () => {} };

describe('SupabaseFinanceRepository.upsertMonthlyRecord — renda padrão e independência entre meses', () => {
  it('novo mês é pré-preenchido com o valor padrão ATUAL de renda do Matheus', async () => {
    const supabase = makeFakeSupabase({
      finance_settings: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          workspace_id: WS,
          default_matheus_income_cents: 500000,
          created_at: '2026-07-31T10:00:00.000Z',
          updated_at: '2026-07-31T10:00:00.000Z',
        },
      ],
    });
    const repo = new SupabaseFinanceRepository(supabase as never, WS, NOOP_NOTIFIER as never);

    const record = await repo.upsertMonthlyRecord({ month: '2026-08-01' });
    expect(record.matheusIncomeCents).toBe(500000);
  });

  it('renda de Lucas NUNCA é copiada do mês anterior — começa em zero quando não informada', async () => {
    const supabase = makeFakeSupabase({
      finance_settings: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          workspace_id: WS,
          default_matheus_income_cents: 500000,
          created_at: '2026-07-31T10:00:00.000Z',
          updated_at: '2026-07-31T10:00:00.000Z',
        },
      ],
      finance_monthly_records: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          workspace_id: WS,
          month: '2026-07-01',
          matheus_income_cents: 500000,
          lucas_income_cents: 320000,
          other_income_cents: 0,
          available_cash_cents: 0,
          saved_cash_cents: 0,
          created_at: '2026-07-31T10:00:00.000Z',
          updated_at: '2026-07-31T10:00:00.000Z',
        },
      ],
    });
    const repo = new SupabaseFinanceRepository(supabase as never, WS, NOOP_NOTIFIER as never);

    const record = await repo.upsertMonthlyRecord({ month: '2026-08-01' });
    expect(record.lucasIncomeCents).toBe(0);
  });

  it('alterar o valor padrão do Matheus NÃO modifica um mês já criado', async () => {
    const supabase = makeFakeSupabase({
      finance_settings: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          workspace_id: WS,
          default_matheus_income_cents: 500000,
          created_at: '2026-07-31T10:00:00.000Z',
          updated_at: '2026-07-31T10:00:00.000Z',
        },
      ],
    });
    const repo = new SupabaseFinanceRepository(supabase as never, WS, NOOP_NOTIFIER as never);

    const julyRecord = await repo.upsertMonthlyRecord({ month: '2026-07-01' });
    expect(julyRecord.matheusIncomeCents).toBe(500000);

    // Simula a atualização do padrão diretamente na tabela de settings
    // (equivalente a FinanceSetupCommands.updateDefaultMatheusIncome).
    (supabase.state.finance_settings[0] as Row).default_matheus_income_cents = 600000;

    const julyAgain = await repo.getMonthlyRecord('2026-07-01');
    expect(julyAgain?.matheusIncomeCents).toBe(500000);

    const augustRecord = await repo.upsertMonthlyRecord({ month: '2026-08-01' });
    expect(augustRecord.matheusIncomeCents).toBe(600000);
  });

  it('renda de Matheus informada explicitamente sobrepõe o valor padrão', async () => {
    const supabase = makeFakeSupabase({
      finance_settings: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          workspace_id: WS,
          default_matheus_income_cents: 500000,
          created_at: '2026-07-31T10:00:00.000Z',
          updated_at: '2026-07-31T10:00:00.000Z',
        },
      ],
    });
    const repo = new SupabaseFinanceRepository(supabase as never, WS, NOOP_NOTIFIER as never);

    const record = await repo.upsertMonthlyRecord({ month: '2026-08-01', matheusIncomeCents: 700000 });
    expect(record.matheusIncomeCents).toBe(700000);
  });

  it('atualizar um mês existente não recria o registro nem reseta outros campos', async () => {
    const supabase = makeFakeSupabase({
      finance_settings: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          workspace_id: WS,
          default_matheus_income_cents: 500000,
          created_at: '2026-07-31T10:00:00.000Z',
          updated_at: '2026-07-31T10:00:00.000Z',
        },
      ],
    });
    const repo = new SupabaseFinanceRepository(supabase as never, WS, NOOP_NOTIFIER as never);

    const created = await repo.upsertMonthlyRecord({ month: '2026-08-01', lucasIncomeCents: 100000 });
    const updated = await repo.upsertMonthlyRecord({ month: '2026-08-01', availableCashCents: 250000 });

    expect(updated.id).toBe(created.id);
    expect(updated.lucasIncomeCents).toBe(100000);
    expect(updated.availableCashCents).toBe(250000);
  });
});

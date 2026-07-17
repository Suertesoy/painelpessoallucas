// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { runIdempotentJob, MAX_ATTEMPTS } from '@/platform/automation/automation-runner';

/**
 * Mock mínimo de automation_runs com a mesma semântica de unicidade do banco:
 * unique (workspace_id, automation_type, idempotency_key).
 */
function makeRunsMock() {
  const rows = new Map<string, Record<string, unknown>>();
  const keyOf = (r: Record<string, unknown>) =>
    `${r.workspace_id}|${r.automation_type}|${r.idempotency_key}`;

  const admin = {
    from: (table: string) => {
      if (table !== 'automation_runs') throw new Error(`tabela inesperada: ${table}`);
      return {
        select: () => {
          const filters: Record<string, unknown> = {};
          const chain = {
            eq: (col: string, val: unknown) => {
              filters[col] = val;
              return chain;
            },
            maybeSingle: async () => {
              const found = [...rows.values()].find(
                (r) =>
                  r.workspace_id === filters.workspace_id &&
                  r.automation_type === filters.automation_type &&
                  r.idempotency_key === filters.idempotency_key
              );
              return { data: found ?? null, error: null };
            },
          };
          return chain;
        },
        insert: async (row: Record<string, unknown>) => {
          const key = keyOf(row);
          if (rows.has(key)) return { error: { message: 'duplicate key' } };
          rows.set(key, { id: key, ...row });
          return { error: null };
        },
        update: (values: Record<string, unknown>) => {
          const filters: Record<string, unknown> = {};
          const doUpdate = async () => {
            for (const row of rows.values()) {
              const matches = Object.entries(filters).every(([c, v]) =>
                c === 'id' ? row.id === v : row[c] === v
              );
              if (matches) Object.assign(row, values);
            }
            return { error: null };
          };
          const chain = {
            eq: (col: string, val: unknown) => {
              filters[col] = val;
              return chain;
            },
            in: () => doUpdate(),
            then: (resolve: (v: { error: null }) => void) => {
              void doUpdate().then(resolve);
            },
          };
          return chain;
        },
      };
    },
  };

  return { admin: admin as never, rows };
}

const WS = 'ws-uuid';

describe('Runner idempotente de automações', () => {
  let mock: ReturnType<typeof makeRunsMock>;

  beforeEach(() => {
    mock = makeRunsMock();
  });

  it('executa o trabalho uma vez e registra completed', async () => {
    const job = vi.fn(async () => ({ done: true }));
    const outcome = await runIdempotentJob(mock.admin, WS, 'daily_digest', '2026-07-17', null, null, job);
    expect(outcome.status).toBe('completed');
    expect(job).toHaveBeenCalledTimes(1);
  });

  it('não executa duas vezes o mesmo trabalho (idempotency_key)', async () => {
    const job = vi.fn(async () => 'ok');
    await runIdempotentJob(mock.admin, WS, 'daily_digest', '2026-07-17', null, null, job);
    const second = await runIdempotentJob(mock.admin, WS, 'daily_digest', '2026-07-17', null, null, job);
    expect(second.status).toBe('skipped');
    expect(job).toHaveBeenCalledTimes(1);
  });

  it('chaves diferentes executam separadamente', async () => {
    const job = vi.fn(async () => 'ok');
    await runIdempotentJob(mock.admin, WS, 'daily_digest', '2026-07-17', null, null, job);
    await runIdempotentJob(mock.admin, WS, 'daily_digest', '2026-07-18', null, null, job);
    expect(job).toHaveBeenCalledTimes(2);
  });

  it('falha é registrada e retentada até o limite', async () => {
    const job = vi.fn(async () => {
      throw new Error('rede fora');
    });

    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      const outcome = await runIdempotentJob(mock.admin, WS, 'calendar_sync', 'h1', null, null, job);
      expect(outcome.status).toBe('failed');
      expect(outcome.attempt).toBe(i);
    }
    // Após esgotar tentativas: skip.
    const after = await runIdempotentJob(mock.admin, WS, 'calendar_sync', 'h1', null, null, job);
    expect(after.status).toBe('skipped');
    expect(job).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it('falha seguida de sucesso completa o trabalho', async () => {
    let calls = 0;
    const job = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('transitório');
      return 'ok';
    });
    const first = await runIdempotentJob(mock.admin, WS, 'reminders', 'h2', null, null, job);
    expect(first.status).toBe('failed');
    const second = await runIdempotentJob(mock.admin, WS, 'reminders', 'h2', null, null, job);
    expect(second.status).toBe('completed');
    const third = await runIdempotentJob(mock.admin, WS, 'reminders', 'h2', null, null, job);
    expect(third.status).toBe('skipped');
  });
});

describe('Cron /api/cron/automation-tick — autorização', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'segredo-de-teste';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exemplo.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'chave-servidor';
  });

  it('rejeita chamadas sem o segredo', async () => {
    const { GET } = await import('@/app/api/cron/automation-tick/route');
    const res = await GET(new Request('https://exemplo.dev/api/cron/automation-tick'));
    expect(res.status).toBe(401);
  });

  it('rejeita segredo incorreto', async () => {
    const { GET } = await import('@/app/api/cron/automation-tick/route');
    const res = await GET(
      new Request('https://exemplo.dev/api/cron/automation-tick', {
        headers: { authorization: 'Bearer errado' },
      })
    );
    expect(res.status).toBe(401);
  });

  it('rejeita tudo quando CRON_SECRET não está configurado', async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import('@/app/api/cron/automation-tick/route');
    const res = await GET(
      new Request('https://exemplo.dev/api/cron/automation-tick', {
        headers: { authorization: 'Bearer qualquer' },
      })
    );
    expect(res.status).toBe(401);
  });

  it('aceita o segredo correto e executa o tick (admin mockado)', async () => {
    // Admin mockado: nenhum workspace → tick conclui vazio com 200.
    vi.resetModules();
    vi.doMock('@/platform/supabase/admin-client', () => ({
      getSupabaseAdminClient: () => ({
        from: () => ({
          select: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }));
    const { GET } = await import('@/app/api/cron/automation-tick/route');
    const res = await GET(
      new Request('https://exemplo.dev/api/cron/automation-tick', {
        headers: { authorization: 'Bearer segredo-de-teste' },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    vi.doUnmock('@/platform/supabase/admin-client');
  });
});

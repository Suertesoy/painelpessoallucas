// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SupabaseFinanceCashRepository } from '@/modules/finance/cash/infrastructure/supabase-finance-cash.repository';
import { FinanceCashCommands } from '@/modules/finance/cash/application/finance-cash.commands';
import { resolveCardGoal } from '@/modules/finance/cash/domain/card-goals';
import { ChangeNotifier } from '@/platform/supabase/change-notifier';

type Row = { id: string; workspace_id: string; scope: string; month: string; amount_cents: number; updated_at: string };

/** Banco falso por workspace: reproduz select/upsert/delete filtrados por workspace_id (como a RLS faz). */
function fakeDb(initial: Row[] = []) {
  const rows = [...initial];
  const calls: { op: string; payload?: unknown; options?: unknown; filters?: [string, unknown][] }[] = [];
  const supabase = {
    from(table: string) {
      expect(table).toBe('finance_card_goals');
      const filters: [string, unknown][] = [];
      const chain: Record<string, unknown> = {};
      const match = () => rows.filter((r) => filters.every(([k, v]) => (r as Record<string, unknown>)[k] === v));
      chain.select = () => chain;
      chain.eq = (k: string, v: unknown) => { filters.push([k, v]); return chain; };
      chain.order = () => Promise.resolve({ data: match(), error: null });
      chain.upsert = (payload: Row, options: unknown) => {
        calls.push({ op: 'upsert', payload, options });
        const existing = rows.find((r) => r.workspace_id === payload.workspace_id && r.scope === payload.scope && r.month === payload.month);
        if (existing) existing.amount_cents = payload.amount_cents;
        else rows.push({ ...payload, id: `g${rows.length + 1}`, updated_at: '2026-10-17T10:00:00Z' });
        return Promise.resolve({ error: null });
      };
      chain.delete = () => {
        const del: Record<string, unknown> = {};
        del.eq = (k: string, v: unknown) => { filters.push([k, v]); return del; };
        del.then = (resolve: (v: unknown) => unknown) => {
          calls.push({ op: 'delete', filters: [...filters] });
          for (const r of match()) rows.splice(rows.indexOf(r), 1);
          return resolve({ error: null });
        };
        return del;
      };
      return chain;
    },
  };
  return { supabase: supabase as never, rows, calls };
}

const WS_CASA = 'ws-casa';
const WS_OUTRA = 'ws-outra';

describe('meta conjunta: repositório', () => {
  it('lista só as metas do próprio workspace e converte centavos inteiros', async () => {
    const { supabase } = fakeDb([
      { id: 'a', workspace_id: WS_CASA, scope: 'default', month: '2026-10', amount_cents: 500000, updated_at: 't' },
      { id: 'b', workspace_id: WS_OUTRA, scope: 'default', month: '2026-10', amount_cents: 123, updated_at: 't' },
    ]);
    const casa = await new SupabaseFinanceCashRepository(supabase, WS_CASA, new ChangeNotifier()).listCardGoals();
    expect(casa.available).toBe(true);
    expect(casa.goals).toEqual([{ id: 'a', scope: 'default', month: '2026-10', amountCents: 500000, updatedAt: 't' }]);
    const outra = await new SupabaseFinanceCashRepository(supabase, WS_OUTRA, new ChangeNotifier()).listCardGoals();
    expect(outra.goals.map((g) => g.amountCents)).toEqual([123]);
  });

  it('Lucas e Matheus (mesmo workspace) enxergam a mesma meta; a edição de um aparece para o outro', async () => {
    const db = fakeDb();
    const lucas = new SupabaseFinanceCashRepository(db.supabase, WS_CASA, new ChangeNotifier());
    const matheus = new SupabaseFinanceCashRepository(db.supabase, WS_CASA, new ChangeNotifier());
    await lucas.upsertCardGoal('default', '2026-10', 500000);
    expect((await matheus.listCardGoals()).goals.map((g) => g.amountCents)).toEqual([500000]);
    await matheus.upsertCardGoal('default', '2026-10', 550000); // editável por qualquer membro; não duplica
    const seen = (await lucas.listCardGoals()).goals;
    expect(seen).toHaveLength(1);
    expect(seen[0].amountCents).toBe(550000);
    // quem está em OUTRA casa não vê nada
    const estranho = new SupabaseFinanceCashRepository(db.supabase, WS_OUTRA, new ChangeNotifier());
    expect((await estranho.listCardGoals()).goals).toEqual([]);
  });

  it('upsert usa a chave única (workspace, escopo, mês) e a exclusão é restrita ao workspace/escopo/mês', async () => {
    const db = fakeDb();
    const repo = new SupabaseFinanceCashRepository(db.supabase, WS_CASA, new ChangeNotifier());
    await repo.upsertCardGoal('month', '2026-12', 800000);
    expect(db.calls[0]).toMatchObject({ op: 'upsert', options: { onConflict: 'workspace_id,scope,month' }, payload: { workspace_id: WS_CASA, scope: 'month', month: '2026-12', amount_cents: 800000 } });
    await repo.deleteCardGoal('month', '2026-12');
    expect(db.calls[1].filters).toEqual([['workspace_id', WS_CASA], ['scope', 'month'], ['month', '2026-12']]);
    expect(db.rows).toHaveLength(0);
  });

  it('exceção mensal removida volta à meta padrão', async () => {
    const db = fakeDb();
    const repo = new SupabaseFinanceCashRepository(db.supabase, WS_CASA, new ChangeNotifier());
    await repo.upsertCardGoal('default', '2026-10', 500000);
    await repo.upsertCardGoal('month', '2026-12', 800000);
    expect(resolveCardGoal((await repo.listCardGoals()).goals, '2026-12')?.amountCents).toBe(800000);
    await repo.deleteCardGoal('month', '2026-12');
    expect(resolveCardGoal((await repo.listCardGoals()).goals, '2026-12')?.amountCents).toBe(500000);
  });

  it('banco ainda sem a tabela: devolve "indisponível" sem quebrar o resto de Finanças', async () => {
    const supabase = {
      from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: null, error: { code: '42P01', message: 'relation "finance_card_goals" does not exist' } }) }) }) }),
    };
    const r = await new SupabaseFinanceCashRepository(supabase as never, WS_CASA, new ChangeNotifier()).listCardGoals();
    expect(r).toEqual({ goals: [], available: false });
  });
});

describe('meta conjunta: comandos', () => {
  function commands() {
    const db = fakeDb();
    const repo = new SupabaseFinanceCashRepository(db.supabase, WS_CASA, new ChangeNotifier());
    const events: { type: string; payload?: unknown }[] = [];
    const eventRepo = { save: vi.fn(async (e: { type: string; payload?: unknown }) => { events.push(e); }) } as never;
    return { ...db, events, cmds: new FinanceCashCommands(repo, eventRepo, WS_CASA) };
  }

  it('grava a meta e emite evento SEM valores monetários', async () => {
    const { cmds, rows, events } = commands();
    await cmds.setCardGoal({ scope: 'default', month: '2026-10', amountCents: 500000 });
    expect(rows[0]).toMatchObject({ scope: 'default', month: '2026-10', amount_cents: 500000 });
    expect(events[0].type).toBe('finance.card_goal_set');
    expect(JSON.stringify(events)).not.toMatch(/500000|amount/i);
  });

  it('recusa valor zero, negativo, fracionado, mês e escopo inválidos', async () => {
    const { cmds, rows } = commands();
    await expect(cmds.setCardGoal({ scope: 'default', month: '2026-10', amountCents: 0 })).rejects.toThrow();
    await expect(cmds.setCardGoal({ scope: 'default', month: '2026-10', amountCents: -100 })).rejects.toThrow();
    await expect(cmds.setCardGoal({ scope: 'default', month: '2026-10', amountCents: 10.5 })).rejects.toThrow();
    await expect(cmds.setCardGoal({ scope: 'default', month: '2026-13', amountCents: 100 })).rejects.toThrow();
    await expect(cmds.setCardGoal({ scope: 'forever' as never, month: '2026-10', amountCents: 100 })).rejects.toThrow();
    expect(rows).toHaveLength(0);
  });

  it('definir ou limpar a meta não toca em faturas, saldos nem lançamentos (só a tabela de metas)', async () => {
    const { cmds, rows } = commands(); // o banco falso falha o teste se qualquer outra tabela for usada
    await cmds.setCardGoal({ scope: 'month', month: '2026-12', amountCents: 800000 });
    await cmds.clearCardGoal('month', '2026-12');
    expect(rows).toHaveLength(0);
  });
});

describe('meta conjunta: migration (SQL aplicado só com autorização)', () => {
  const sql = readFileSync(path.join(process.cwd(), 'supabase/migrations/20261017100000_finance_card_goals.sql'), 'utf8');

  it('é aditiva: cria só a tabela de metas e não semeia nenhum valor', () => {
    expect(sql).toMatch(/create table public\.finance_card_goals/);
    expect(sql).not.toMatch(/\binsert\s+into\b/i);
    expect(sql).not.toMatch(/\balter\s+table\s+public\.(?!finance_card_goals)/i);
    expect(sql).not.toMatch(/\bdrop\b|\btruncate\b|\bdelete\s+from\b/i);
  });

  it('isola por workspace via RLS, tem chave única, checagens e Realtime', () => {
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/is_workspace_member\(workspace_id\)/);
    expect(sql).toMatch(/unique \(workspace_id, scope, month\)/);
    expect(sql).toMatch(/amount_cents > 0/);
    expect(sql).toMatch(/scope in \('default', 'month'\)/);
    expect(sql).toMatch(/supabase_realtime/);
    expect(sql).toMatch(/grant select, insert, update, delete on public\.finance_card_goals to authenticated/);
    expect(sql).not.toMatch(/to anon/);
  });
});

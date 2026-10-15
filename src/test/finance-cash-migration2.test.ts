// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const NL = String.fromCharCode(10);
const sql = readFileSync(
  path.resolve(__dirname, '../../supabase/migrations/20260816100000_finance_categories_fixed_incomes.sql'),
  'utf-8'
).split(String.fromCharCode(13)).join('');
const TABLES = ['finance_recurring_incomes', 'finance_recurring_income_occurrences'];

function policyBlocks(table: string): string[] {
  const marker = ' on public.' + table + NL;
  return sql.split('create policy ').slice(1).map((b) => b.split(';')[0]).filter((b) => b.includes(marker));
}
function grantsOn(table: string, role: string): string[] {
  return sql.split(NL).filter((l) => l.startsWith('grant ') && l.includes(' on public.' + table + ' to ' + role));
}

describe('migration finance_categories_fixed_incomes', () => {
  for (const t of TABLES) {
    it(t + ': RLS, política de membro, sem anon e sem delete', () => {
      expect(sql).toContain('alter table public.' + t + ' enable row level security;');
      const policies = policyBlocks(t);
      expect(policies.length).toBe(3);
      for (const p of policies) expect(p).toContain('is_workspace_member(workspace_id)');
      expect(grantsOn(t, 'anon')).toEqual([]);
      for (const line of grantsOn(t, 'authenticated')) expect(line).not.toContain('delete');
    });
  }

  it('é aditiva: só adiciona colunas à tabela de itens e não apaga nem reescreve nada', () => {
    expect(sql).not.toMatch(/\bdrop\s+(table|column|policy)\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/^\s*delete\s+from/im);
    expect(sql).not.toMatch(/^\s*update\s+public\.finance_invoice_items/im);
    const alters = sql.match(/alter table public\.[a-z_]+\s+add column [a-z_]+/g) ?? [];
    expect(alters.length).toBe(2);
    for (const a of alters) expect(a).toMatch(/finance_invoice_items/);
  });

  it('finalidade é um conjunto fechado e a categoria só tem o formato validado', () => {
    expect(sql).toContain("purpose in ('personal', 'household', 'professional')");
    expect(sql).toContain("category ~ '^[a-z_]{2,40}$'");
  });

  it('funções: SECURITY INVOKER, sem execute para anon/public', () => {
    expect(sql).not.toMatch(/security definer/i);
    expect(sql).toMatch(/revoke execute on function public\.finance_mark_income_received[^;]*from public, anon/);
    expect(sql).toMatch(/grant execute on function public\.finance_mark_income_received[^;]*to authenticated/);
  });

  it('o término é inclusivo e o mês final não pode preceder o início', () => {
    expect(sql).toContain('check (end_month is null or end_month >= start_month)');
    expect(sql).toContain('p_month > v_income.end_month');
  });

  it('confirmar recebimento é idempotente: retorna antes de somar ao saldo', () => {
    const fn = sql.slice(sql.indexOf('function public.finance_mark_income_received'), sql.indexOf('function public.finance_reset_income_occurrence'));
    expect(fn).toContain("if v_occ.status = 'received' then");
    expect(fn.indexOf("if v_occ.status = 'received'")).toBeLessThan(fn.indexOf('available_cents = available_cents +'));
  });

  it('desfazer só reverte o saldo se nada o alterou depois da confirmação', () => {
    const fn = sql.slice(sql.indexOf('function public.finance_reset_income_occurrence'));
    expect(fn).toContain('BALANCE_CHANGED_SINCE');
    expect(fn).toContain('v_balance.available_updated_at > v_occ.received_at');
    expect(fn.indexOf('BALANCE_CHANGED_SINCE')).toBeLessThan(fn.indexOf('available_cents = available_cents - v_occ.received_cents'));
  });

  it('ocorrências futuras não são gravadas: no máximo uma exceção/confirmação por mês', () => {
    expect(sql).toContain('unique (income_id, month)');
  });
});

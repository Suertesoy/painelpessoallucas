// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Isolamento por usuário: garante, sobre o SQL da migration, que toda tabela
 * nova tem RLS ligada, políticas por is_workspace_member, nenhum privilégio
 * para anon e chaves estrangeiras compostas por workspace. A verificação real
 * (com dois usuários) é feita contra o banco ao aplicar a migration.
 */
const NL = String.fromCharCode(10);
const sql = readFileSync(
  path.resolve(__dirname, '../../supabase/migrations/20260815100000_finance_cash_core.sql'),
  'utf-8'
).split(String.fromCharCode(13)).join('');
const TABLES = [
  'finance_balance', 'finance_balance_transfers', 'finance_receivables', 'finance_commitments',
  'finance_commitment_occurrences', 'finance_card_invoices', 'finance_invoice_imports', 'finance_invoice_items',
];

/** Blocos `create policy ... ;` da tabela informada. */
function policyBlocks(table: string): string[] {
  const marker = ' on public.' + table + NL;
  return sql
    .split('create policy ')
    .slice(1)
    .map((block) => block.split(';')[0])
    .filter((block) => block.includes(marker));
}

function grantsOn(table: string, role: string): string[] {
  return sql
    .split(NL)
    .filter((line) => line.startsWith('grant ') && line.includes(' on public.' + table + ' to ' + role));
}

describe('migration finance_cash_core', () => {
  for (const t of TABLES) {
    it(`${t}: RLS ligada, policy de membro do workspace, sem grant para anon`, () => {
      expect(sql).toContain('alter table public.' + t + ' enable row level security;');
      const policies = policyBlocks(t);
      expect(policies.length).toBeGreaterThan(0);
      for (const p of policies) expect(p).toContain('is_workspace_member(workspace_id)');
      expect(grantsOn(t, 'anon')).toEqual([]);
      expect(grantsOn(t, 'authenticated').length).toBe(1);
    });
    it(`${t}: nenhum delete concedido ao usuário`, () => {
      for (const line of grantsOn(t, 'authenticated')) expect(line).not.toContain('delete');
    });
  }

  it('é aditiva: nenhum drop/delete/truncate nem alteração de tabela existente', () => {
    expect(sql).not.toMatch(/\bdrop\s+(table|column|policy)\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/^\s*delete\s+from/im);
    const alters = sql.match(/alter table public\.[a-z_]+/g) ?? [];
    for (const a of alters) expect(a).toMatch(/alter table public\.finance_/);
  });

  it('funções são SECURITY INVOKER, sem execute para anon/public', () => {
    expect(sql).not.toMatch(/security definer/i);
    expect(sql).toMatch(/revoke execute on function public\.finance_apply_invoice_import[^;]*from public, anon/);
    expect(sql).toMatch(/grant execute on function public\.finance_apply_invoice_import[^;]*to authenticated/);
  });

  it('referências entre tabelas usam chave composta (workspace_id, id)', () => {
    expect(sql).toContain('foreign key (workspace_id, invoice_id) references public.finance_card_invoices (workspace_id, id)');
    expect(sql).toContain('foreign key (workspace_id, commitment_id) references public.finance_commitments (workspace_id, id)');
  });

  it('itens de fatura têm identidade única por data+descrição+valor+ocorrência', () => {
    expect(sql).toContain('unique (workspace_id, invoice_id, purchase_date, normalized_description, amount_cents, occurrence_index)');
  });
});

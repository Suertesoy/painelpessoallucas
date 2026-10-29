// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClassifierControls, type Classification } from '@/components/finance-cash/item-classifier';
import type { InvoiceItem } from '@/modules/finance/cash/domain/types';

afterEach(cleanup);

const baseItem: InvoiceItem = {
  id: 'i1', invoiceId: 'inv', date: '2026-10-05', description: 'APPLE.COM/BILL', normalizedDescription: 'apple com bill',
  amountCents: 6690, kind: 'purchase', occurrenceIndex: 0, installmentNo: null, installmentTotal: null,
  baseDescription: 'APPLE.COM/BILL', status: 'active', commitmentId: null, reviewNote: null,
  category: 'armazenamento', purpose: null, categorySource: 'user', categoryRuleId: null,
};

function fakeClassification(over: Partial<Classification> = {}): Classification {
  return {
    pending: false, error: null,
    categories: [{ id: 'armazenamento', label: 'Armazenamento' }, { id: 'subscriptions', label: 'Assinaturas e aplicativos' }],
    rules: [], labelFor: (id: string | null) => id ?? 'Sem categoria',
    suggestionFor: () => null, classify: vi.fn(async () => true), accept: vi.fn(async () => true), acceptMany: vi.fn(async () => true),
    classifyWithNewCategory: vi.fn(async () => true), learn: vi.fn(async () => 3), ruleFor: () => null,
    ...over,
  } as unknown as Classification;
}

describe('aprendizado automático (interface)', () => {
  it('não pede segunda confirmação: sem caixa nem botão de salvar regra', () => {
    render(<ClassifierControls item={baseItem} classification={fakeClassification()} />);
    expect(screen.queryByLabelText('Usar esta categoria em lançamentos semelhantes')).toBeNull();
    expect(screen.queryByText('Salvar regra')).toBeNull();
  });

  it('estabelecimento ambíguo (Apple) avisa que só o mesmo valor é lembrado', () => {
    render(<ClassifierControls item={baseItem} classification={fakeClassification()} />);
    expect(screen.getByText(/só para o mesmo valor/)).toBeTruthy();
  });

  it('estabelecimento comum avisa que lembra para lançamentos equivalentes', () => {
    render(<ClassifierControls item={{ ...baseItem, baseDescription: 'Padaria Central' }} classification={fakeClassification()} />);
    expect(screen.getByText(/lembra esta escolha para lançamentos equivalentes/)).toBeTruthy();
  });

  it('regra ativa é exibida; item de regra mostra a marca "por regra" e sem categoria nada é dito', () => {
    const rule = { id: 'r', merchantKey: 'apple com bill', amountCents: 6690, category: 'armazenamento' };
    const { rerender } = render(<ClassifierControls item={baseItem} classification={fakeClassification({ ruleFor: () => rule } as never)} />);
    expect(screen.getByText(/Lembrado:/)).toBeTruthy();
    rerender(<ClassifierControls item={{ ...baseItem, categorySource: 'rule' }} classification={fakeClassification()} />);
    expect(screen.getByText('por regra')).toBeTruthy();
    rerender(<ClassifierControls item={{ ...baseItem, category: null, categorySource: null }} classification={fakeClassification()} />);
    expect(screen.queryByText(/lembra/)).toBeNull();
  });

  it('criar categoria nova pelo seletor abre o campo de nome e classifica com ela', async () => {
    const classification = fakeClassification();
    render(<ClassifierControls item={{ ...baseItem, category: null, categorySource: null }} classification={classification} />);
    fireEvent.change(screen.getByLabelText(/Categoria de/), { target: { value: '__new__' } });
    fireEvent.change(screen.getByLabelText('Nome da nova categoria'), { target: { value: 'Armazenamento' } });
    fireEvent.click(screen.getByText('Criar e usar'));
    await waitFor(() => expect(classification.classifyWithNewCategory).toHaveBeenCalled());
  });
});

describe('migration de categorias e regras aprendidas', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260818100000_finance_category_learning.sql'), 'utf8');

  it('isola por workspace com RLS em todas as tabelas e sem acesso anônimo', () => {
    for (const table of ['finance_item_categories', 'finance_category_seed', 'finance_category_rules']) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`));
    }
    expect((sql.match(/is_workspace_member\(workspace_id\)/g) ?? []).length).toBeGreaterThanOrEqual(12);
    expect(sql).not.toMatch(/to anon/);
  });

  it('id estável separado do nome, nome único por workspace e edição liberada (renomear/excluir)', () => {
    expect(sql).toMatch(/primary key \(workspace_id, id\)/);
    expect(sql).toMatch(/unique index finance_item_categories_label_idx/);
    expect(sql).toMatch(/create policy "finance_item_categories_update"/);
    expect(sql).toMatch(/create policy "finance_item_categories_delete"/);
  });

  it('regra nunca aponta para categoria inexistente (FK composta com cascade) e é única por estabelecimento + valor', () => {
    expect(sql).toMatch(/foreign key \(workspace_id, category\)\s+references public\.finance_item_categories \(workspace_id, id\) on delete cascade/);
    expect(sql).toMatch(/unique index finance_category_rules_key_idx/);
    expect(sql).not.toMatch(/references public\.finance_categories\b/); // sem a tabela legada
  });

  it('não altera nem apaga dados existentes e preserva purpose', () => {
    expect(sql).not.toMatch(/\bupdate public\./i);
    expect(sql).not.toMatch(/\bdelete from\b/i);
    expect(sql).not.toMatch(/drop (table|column)/i);
    expect(sql).not.toMatch(/alter column/i);
    expect(sql).not.toMatch(/purpose/i.source.replace('purpose', 'drop column purpose'));
    expect(sql).toMatch(/add column category_source/);
  });
});

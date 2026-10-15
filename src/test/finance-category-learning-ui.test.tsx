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
    customCategories: [{ id: 'armazenamento', label: 'Armazenamento' }],
    rules: [], labelFor: (id: string | null) => id ?? 'Sem categoria',
    suggestionFor: () => null, classify: vi.fn(async () => true), accept: vi.fn(async () => true), acceptMany: vi.fn(async () => true),
    classifyWithNewCategory: vi.fn(async () => true), learn: vi.fn(async () => 3), ruleFor: () => null,
    ...over,
  } as unknown as Classification;
}

describe('aprender com lançamentos semelhantes (interface)', () => {
  it('a opção é voluntária: vem desligada e não mostra nada além do rótulo', () => {
    render(<ClassifierControls item={baseItem} classification={fakeClassification()} />);
    const box = screen.getByLabelText('Usar esta categoria em lançamentos semelhantes') as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(screen.queryByText('Salvar regra')).toBeNull();
  });

  it('ao ativar, o padrão é estabelecimento + mesmo valor e salvar aprende com "amount"', async () => {
    const classification = fakeClassification();
    render(<ClassifierControls item={baseItem} classification={classification} />);
    fireEvent.click(screen.getByLabelText('Usar esta categoria em lançamentos semelhantes'));
    expect((screen.getByLabelText(/Mesmo estabelecimento e mesmo valor/) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByText('Salvar regra'));
    await waitFor(() => expect(classification.learn).toHaveBeenCalledWith(baseItem, 'armazenamento', 'amount'));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('3 outros lançamentos classificados'));
  });

  it('qualquer valor é escolha explícita e avisa quando o estabelecimento é ambíguo (Apple)', () => {
    const classification = fakeClassification();
    render(<ClassifierControls item={baseItem} classification={classification} />);
    fireEvent.click(screen.getByLabelText('Usar esta categoria em lançamentos semelhantes'));
    expect(screen.queryByText(/cobra serviços diferentes/)).toBeNull();
    fireEvent.click(screen.getByLabelText('Qualquer valor deste estabelecimento'));
    expect(screen.getByText(/cobra serviços diferentes/)).toBeTruthy();
    fireEvent.click(screen.getByText('Salvar regra'));
    expect(classification.learn).toHaveBeenCalledWith(baseItem, 'armazenamento', 'merchant');
  });

  it('sem categoria não oferece aprender; lançamento classificado por regra mostra a marca "por regra"', () => {
    const { rerender } = render(<ClassifierControls item={{ ...baseItem, category: null, categorySource: null }} classification={fakeClassification()} />);
    expect(screen.queryByLabelText('Usar esta categoria em lançamentos semelhantes')).toBeNull();
    rerender(<ClassifierControls item={{ ...baseItem, categorySource: 'rule' }} classification={fakeClassification()} />);
    expect(screen.getByText('por regra')).toBeTruthy();
    expect(screen.queryByLabelText('Usar esta categoria em lançamentos semelhantes')).toBeNull();
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

describe('migration de aprendizado de categorias', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260818100000_finance_category_learning.sql'), 'utf8');

  it('isola por workspace com RLS em todas as operações e sem acesso anônimo', () => {
    expect(sql).toMatch(/alter table public\.finance_custom_categories enable row level security/);
    expect(sql).toMatch(/alter table public\.finance_category_rules enable row level security/);
    expect((sql.match(/is_workspace_member\(workspace_id\)/g) ?? []).length).toBeGreaterThanOrEqual(7);
    expect(sql).not.toMatch(/to anon/);
  });

  it('não altera nem apaga dados existentes', () => {
    expect(sql).not.toMatch(/\bupdate public\./i);
    expect(sql).not.toMatch(/\bdelete from\b/i);
    expect(sql).not.toMatch(/drop (table|column)/i);
    expect(sql).not.toMatch(/alter column/i);
    expect(sql).toMatch(/add column category_source/);
  });

  it('mantém uma regra por estabelecimento + valor e não reaproveita a tabela legada', () => {
    expect(sql).toMatch(/unique index finance_category_rules_key_idx/);
    expect(sql).not.toMatch(/references public\.finance_categories/);
  });
});

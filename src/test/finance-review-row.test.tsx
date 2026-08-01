// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { FinanceReviewRow } from '@/components/finance/finance-review-row';
import type { FinanceImportRow } from '@/modules/finance/domain/finance-import.schema';
import type { FinanceCategory } from '@/modules/finance/domain/finance-category.schema';

/**
 * Edição em andamento não pode ser sobrescrita por uma nova renderização
 * reativa (realtime ou recategorização) — item 26 da lista de testes
 * obrigatórios, coberto aqui como teste de INTERFACE (não só do
 * classificador puro).
 */

const CATEGORY_MERCADO: FinanceCategory = {
  id: 'cat-mercado',
  workspaceId: 'ws-1',
  slug: 'mercado',
  name: 'Mercado',
  position: 0,
  createdAt: '2026-07-31T10:00:00.000Z',
  updatedAt: '2026-07-31T10:00:00.000Z',
};
const CATEGORY_ALIMENTACAO: FinanceCategory = {
  id: 'cat-alimentacao',
  workspaceId: 'ws-1',
  slug: 'alimentacao',
  name: 'Alimentação',
  position: 1,
  createdAt: '2026-07-31T10:00:00.000Z',
  updatedAt: '2026-07-31T10:00:00.000Z',
};

function makeRow(overrides: Partial<FinanceImportRow> = {}): FinanceImportRow {
  return {
    id: 'row-1',
    workspaceId: 'ws-1',
    importId: 'import-1',
    rowIndex: 0,
    transactionDate: '2026-07-05',
    description: 'Supermercado ABC',
    originalDescription: 'SUPERMERCADO ABC LTDA',
    amountCents: -4590,
    sourceAmountCents: null,
    fitid: null,
    fingerprint: null,
    categoryId: CATEGORY_MERCADO.id,
    nature: 'purchase',
    suggestedCategoryId: CATEGORY_MERCADO.id,
    suggestedNature: 'purchase',
    classificationReason: 'contém "supermercado"',
    possibleDuplicateTransactionId: null,
    possibleDuplicateImportRowId: null,
    status: 'pending_review',
    createdAt: '2026-07-31T10:00:00.000Z',
    updatedAt: '2026-07-31T10:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => cleanup());

describe('FinanceReviewRow — edição em andamento sobrevive a refetch', () => {
  it('não sobrescreve a descrição editada quando o prop `row` muda (simulando refetch reativo)', async () => {
    const onSave = vi.fn(async () => {});
    const onIgnore = vi.fn(async () => {});
    const onCreateRule = vi.fn(async () => {});
    const row = makeRow();

    const { rerender } = render(
      <FinanceReviewRow row={row} categories={[CATEGORY_MERCADO, CATEGORY_ALIMENTACAO]} onSave={onSave} onIgnore={onIgnore} onCreateRule={onCreateRule} />
    );

    const descriptionInput = screen.getByLabelText('Descrição do lançamento') as HTMLInputElement;
    fireEvent.change(descriptionInput, { target: { value: 'Supermercado ABC (editado pelo usuário)' } });
    expect(descriptionInput.value).toBe('Supermercado ABC (editado pelo usuário)');

    // Simula um refetch reativo trazendo o MESMO registro persistido (ainda
    // sem refletir a edição, já que ela não foi salva) — uma nova referência
    // de objeto, como uma query real devolveria.
    const refetchedRow = makeRow({ updatedAt: '2026-07-31T10:05:00.000Z' });
    rerender(
      <FinanceReviewRow row={refetchedRow} categories={[CATEGORY_MERCADO, CATEGORY_ALIMENTACAO]} onSave={onSave} onIgnore={onIgnore} onCreateRule={onCreateRule} />
    );

    expect(descriptionInput.value).toBe('Supermercado ABC (editado pelo usuário)');
  });

  it('depois de salvar, uma nova renderização com o valor persistido não é mais bloqueada (não fica presa em modo sujo para sempre)', async () => {
    const onSave = vi.fn(async () => {});
    const onIgnore = vi.fn(async () => {});
    const onCreateRule = vi.fn(async () => {});
    const row = makeRow();

    const { rerender } = render(
      <FinanceReviewRow row={row} categories={[CATEGORY_MERCADO, CATEGORY_ALIMENTACAO]} onSave={onSave} onIgnore={onIgnore} onCreateRule={onCreateRule} />
    );

    const categorySelect = screen.getByLabelText('Categoria') as HTMLSelectElement;
    fireEvent.change(categorySelect, { target: { value: CATEGORY_ALIMENTACAO.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('row-1', {
      categoryId: CATEGORY_ALIMENTACAO.id,
      nature: 'purchase',
      description: 'Supermercado ABC',
    }));

    // Depois de salvo (dirty=false), um refetch trazendo a categoria já
    // persistida deve refletir normalmente.
    const persistedRow = makeRow({ categoryId: CATEGORY_ALIMENTACAO.id, updatedAt: '2026-07-31T10:05:00.000Z' });
    rerender(
      <FinanceReviewRow row={persistedRow} categories={[CATEGORY_MERCADO, CATEGORY_ALIMENTACAO]} onSave={onSave} onIgnore={onIgnore} onCreateRule={onCreateRule} />
    );
    await waitFor(() => expect((screen.getByLabelText('Categoria') as HTMLSelectElement).value).toBe(CATEGORY_ALIMENTACAO.id));
  });

  it('oferece "aplicar a lançamentos semelhantes" só depois de mudar a categoria sugerida e salvar', async () => {
    const onSave = vi.fn(async () => {});
    const onIgnore = vi.fn(async () => {});
    const onCreateRule = vi.fn(async () => {});
    const row = makeRow();

    render(<FinanceReviewRow row={row} categories={[CATEGORY_MERCADO, CATEGORY_ALIMENTACAO]} onSave={onSave} onIgnore={onIgnore} onCreateRule={onCreateRule} />);

    expect(screen.queryByText(/Aplicar esta classificação/i)).toBeNull();

    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: CATEGORY_ALIMENTACAO.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.getByText(/Aplicar esta classificação/i)).toBeTruthy());

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onCreateRule).toHaveBeenCalledWith({
      matchText: 'Supermercado ABC',
      categoryId: CATEGORY_ALIMENTACAO.id,
      nature: 'purchase',
    }));
  });

  it('marca possível duplicidade com um aviso visível', () => {
    const row = makeRow({ possibleDuplicateTransactionId: 'tx-existing' });
    render(<FinanceReviewRow row={row} categories={[CATEGORY_MERCADO]} onSave={vi.fn()} onIgnore={vi.fn()} onCreateRule={vi.fn()} />);
    expect(screen.getByText(/Possível duplicidade/i)).toBeTruthy();
  });

  it('ignorar chama onIgnore com o id da linha', () => {
    const onIgnore = vi.fn(async () => {});
    const row = makeRow();
    render(<FinanceReviewRow row={row} categories={[CATEGORY_MERCADO]} onSave={vi.fn()} onIgnore={onIgnore} onCreateRule={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ignorar' }));
    expect(onIgnore).toHaveBeenCalledWith('row-1');
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Suspense } from 'react';
import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react';
import FinanceReviewPage from '@/app/financas/revisao/[importId]/page';
import type { FinanceImportRow } from '@/modules/finance/domain/finance-import.schema';
import type { FinanceImport } from '@/modules/finance/domain/finance-import.schema';

/**
 * Fila de revisão do lote (seção 8 do pedido): `Arquivo X de N`, "Próxima
 * importação pendente" após confirmar, e "Voltar ao resumo do lote" — item
 * 24 da lista de testes obrigatórios (seção 15). Coordenação puramente local
 * via query string (`?queue=...&pos=...`), sem entidade de lote persistida.
 */

const push = vi.fn();
let searchParamsValue = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}));

const IMPORT_ROW: FinanceImportRow = {
  id: 'row-1',
  workspaceId: 'ws-1',
  importId: 'imp-1',
  rowIndex: 0,
  transactionDate: '2026-07-05',
  description: 'Supermercado ABC',
  originalDescription: 'SUPERMERCADO ABC',
  amountCents: -4590,
  sourceAmountCents: null,
  fitid: null,
  fingerprint: null,
  categoryId: 'cat-1',
  nature: 'purchase',
  suggestedCategoryId: 'cat-1',
  suggestedNature: 'purchase',
  classificationReason: null,
  possibleDuplicateTransactionId: null,
  possibleDuplicateImportRowId: null,
  status: 'pending_review',
  createdAt: '2026-07-31T10:00:00.000Z',
  updatedAt: '2026-07-31T10:00:00.000Z',
};

function makeImport(id: string, status: FinanceImport['status'] = 'pending_review'): FinanceImport {
  return {
    id,
    workspaceId: 'ws-1',
    sourceId: 'src-1',
    fileName: 'Extrato Nubank • 01/06/2026 a 20/06/2026',
    fileSha256: 'a'.repeat(64),
    format: 'csv',
    status,
    rowCount: 1,
    statementStart: '2026-06-01',
    statementEnd: '2026-06-20',
    confirmedAt: status === 'confirmed' ? '2026-07-31T10:00:00.000Z' : null,
    createdAt: '2026-07-31T10:00:00.000Z',
    updatedAt: '2026-07-31T10:00:00.000Z',
  };
}

const getImportReview = vi.fn();
const listCategories = vi.fn(async () => []);
const confirmImport = vi.fn();
const updateReviewRow = vi.fn();
const ignoreRow = vi.fn();
const createClassificationRuleFromReview = vi.fn();

const fakeRepo = { subscribe: () => () => {} };

vi.mock('@/providers/repository.provider', () => ({
  useRepositories: () => ({
    itemRepository: fakeRepo,
    projectRepository: fakeRepo,
    dailyPlanRepository: fakeRepo,
    calendarEventLinkRepository: fakeRepo,
    learningContentRepository: fakeRepo,
    studySessionRepository: fakeRepo,
    lessonProgressRepository: fakeRepo,
    shoppingListRepository: fakeRepo,
    financeRepository: fakeRepo,
    changeNotifier: { subscribe: () => () => {} },
  }),
  useQueries: () => ({
    finance: { queries: { getImportReview, listCategories } },
  }),
  useCommands: () => ({
    finance: { import: { confirmImport, updateReviewRow, ignoreRow, createClassificationRuleFromReview } },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  listCategories.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  searchParamsValue = '';
});

async function renderPage(importId: string) {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <FinanceReviewPage params={Promise.resolve({ importId })} />
      </Suspense>
    );
  });
}

describe('FinanceReviewPage — fila de revisão do lote', () => {
  it('sem fila (importação avulsa): não mostra indicador "Arquivo X de N"', async () => {
    getImportReview.mockResolvedValue({ import: makeImport('imp-1'), rows: [IMPORT_ROW] });
    await renderPage('imp-1');
    await waitFor(() => expect(screen.getByText(/Revisão da importação/i)).toBeTruthy());
    expect(screen.queryByText(/Arquivo \d+ de \d+/i)).toBeNull();
  });

  it('com fila: mostra "Arquivo X de N" com a posição correta', async () => {
    searchParamsValue = 'queue=imp-1,imp-2,imp-3&pos=1';
    getImportReview.mockResolvedValue({ import: makeImport('imp-2'), rows: [IMPORT_ROW] });
    await renderPage('imp-2');
    await waitFor(() => expect(screen.getByText('Arquivo 2 de 3')).toBeTruthy());
  });

  it('ao confirmar, oferece "Próxima importação pendente" que navega para o próximo item da fila', async () => {
    searchParamsValue = 'queue=imp-1,imp-2,imp-3&pos=0';
    getImportReview.mockResolvedValue({ import: makeImport('imp-1'), rows: [IMPORT_ROW] });
    confirmImport.mockResolvedValue({ import: makeImport('imp-1', 'confirmed'), createdTransactionCount: 1, alreadyConfirmed: false });
    await renderPage('imp-1');

    await waitFor(() => expect(screen.getByRole('button', { name: /Confirmar importação/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Confirmar importação/i }));

    const nextButton = await screen.findByRole('button', { name: /Próxima importação pendente/i });
    fireEvent.click(nextButton);
    expect(push).toHaveBeenCalledWith('/financas/revisao/imp-2?queue=imp-1,imp-2,imp-3&pos=1');
  });

  it('última importação da fila: ao confirmar, não oferece "próxima" — oferece voltar ao resumo do lote', async () => {
    searchParamsValue = 'queue=imp-1,imp-2,imp-3&pos=2';
    getImportReview.mockResolvedValue({ import: makeImport('imp-3'), rows: [IMPORT_ROW] });
    confirmImport.mockResolvedValue({ import: makeImport('imp-3', 'confirmed'), createdTransactionCount: 1, alreadyConfirmed: false });
    await renderPage('imp-3');

    await waitFor(() => expect(screen.getByRole('button', { name: /Confirmar importação/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Confirmar importação/i }));

    await waitFor(() => expect(screen.queryByRole('button', { name: /Próxima importação pendente/i })).toBeNull());
    const backButton = await screen.findByRole('button', { name: /Voltar ao resumo do lote/i });
    fireEvent.click(backButton);
    expect(push).toHaveBeenCalledWith('/financas/importar');
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';
import FinanceImportPage from '@/app/financas/importar/page';

/**
 * Importação em lote (seções 2, 6 e 7 do pedido): múltiplos arquivos numa
 * única seleção, formato de cada um detectado automaticamente, sem seletor
 * de origem/pessoa, erro ou duplicidade de um arquivo nunca bloqueando os
 * demais, e concorrência limitada e previsível. Cobre os itens 1-13 e 26 da
 * lista de testes obrigatórios (seção 15).
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

function makeFile(name: string, sizeBytes = 100): File {
  return new File([new Uint8Array(sizeBytes)], name, { type: 'text/csv' });
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

async function getUploadedFileName(init: RequestInit | undefined): Promise<string> {
  const formData = init?.body as FormData;
  const file = formData.get('file') as File;
  return file.name;
}

beforeEach(() => {
  push.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FinanceImportPage — seleção de múltiplos arquivos', () => {
  it('aceita quatro arquivos numa única seleção e renderiza a lista com nome e status de cada um', async () => {
    render(<FinanceImportPage />);
    const input = screen.getByLabelText(/Selecionar arquivos CSV ou OFX/i) as HTMLInputElement;
    expect(input.multiple).toBe(true);

    const files = [makeFile('a.csv'), makeFile('b.csv'), makeFile('c.ofx'), makeFile('d.csv')];
    fireEvent.change(input, { target: { files } });

    await waitFor(() => expect(screen.getByText(/4 arquivo.s. selecionado/i)).toBeTruthy());
    for (const f of files) expect(screen.getByText(f.name)).toBeTruthy();
  });

  it('permite remover um arquivo específico antes do processamento', async () => {
    render(<FinanceImportPage />);
    const input = screen.getByLabelText(/Selecionar arquivos CSV ou OFX/i);
    fireEvent.change(input, { target: { files: [makeFile('manter.csv'), makeFile('remover.csv')] } });
    await waitFor(() => expect(screen.getByText('remover.csv')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Remover remover.csv/i }));

    expect(screen.queryByText('remover.csv')).toBeNull();
    expect(screen.getByText('manter.csv')).toBeTruthy();
  });

  it('marca como inválido um arquivo acima do limite de 10 MB, sem impedir os demais', async () => {
    render(<FinanceImportPage />);
    const input = screen.getByLabelText(/Selecionar arquivos CSV ou OFX/i);
    const tooBig = makeFile('grande.csv', 11 * 1024 * 1024);
    const ok = makeFile('normal.csv', 1024);
    fireEvent.change(input, { target: { files: [tooBig, ok] } });

    await waitFor(() => expect(screen.getAllByText(/Inválido/i).length).toBeGreaterThan(0));
    expect(screen.getByText('normal.csv')).toBeTruthy();
  });

  it('impede ultrapassar o limite total do lote (40 MB), sem adicionar o arquivo que estouraria o total', async () => {
    render(<FinanceImportPage />);
    const input = screen.getByLabelText(/Selecionar arquivos CSV ou OFX/i);
    const big1 = makeFile('lote1.csv', 15 * 1024 * 1024);
    const big2 = makeFile('lote2.csv', 15 * 1024 * 1024);
    const big3 = makeFile('lote3.csv', 15 * 1024 * 1024);
    fireEvent.change(input, { target: { files: [big1, big2, big3] } });

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('lote1.csv')).toBeTruthy();
    expect(screen.getByText('lote2.csv')).toBeTruthy();
    expect(screen.queryByText('lote3.csv')).toBeNull();
  });

  it('impede ultrapassar o limite de 10 arquivos por lote', async () => {
    render(<FinanceImportPage />);
    const input = screen.getByLabelText(/Selecionar arquivos CSV ou OFX/i);
    const files = Array.from({ length: 12 }, (_, i) => makeFile(`arquivo-${i}.csv`));
    fireEvent.change(input, { target: { files } });

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getAllByRole('listitem').length).toBeLessThanOrEqual(10);
  });

  it('sem seletor de origem: não existe nenhum campo obrigatório para escolher origem/pessoa antes do upload', async () => {
    render(<FinanceImportPage />);
    expect(screen.queryByText(/^Origem$/i)).toBeNull();
    expect(screen.queryByText(/Cartão Nubank Lucas/i)).toBeNull();
    expect(screen.queryByText(/Cartão Nubank Matheus/i)).toBeNull();
    expect(screen.queryByText(/Cartão C6 Lucas/i)).toBeNull();
    expect(screen.queryByRole('combobox', { name: /origem/i })).toBeNull();
  });
});

describe('FinanceImportPage — processamento em lote (concorrência, erro e duplicidade independentes)', () => {
  it('processa com concorrência limitada (nunca mais que 2 requisições simultâneas)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    global.fetch = vi.fn(async (_url, init) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 15));
      inFlight -= 1;
      const name = await getUploadedFileName(init);
      return jsonResponse(200, { importId: `imp-${name}`, reopened: false, rowCount: 1, profile: 'generic', sourceName: 'Conta (formato genérico)' });
    }) as unknown as typeof fetch;

    render(<FinanceImportPage />);
    const input = screen.getByLabelText(/Selecionar arquivos CSV ou OFX/i);
    fireEvent.change(input, { target: { files: [makeFile('a.csv'), makeFile('b.csv'), makeFile('c.csv'), makeFile('d.csv')] } });
    await waitFor(() => expect(screen.getByText(/4 arquivo.s. selecionado/i)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Processar/i }));

    await waitFor(() => expect(screen.getByText(/Resumo do lote/i)).toBeTruthy(), { timeout: 3000 });
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('um arquivo inválido no lote não bloqueia o processamento dos outros três', async () => {
    global.fetch = vi.fn(async (_url, init) => {
      const name = await getUploadedFileName(init);
      if (name === 'ruim.csv') return jsonResponse(400, { error: 'Não foi possível interpretar o CSV.', errorCategory: 'invalid_format' });
      return jsonResponse(200, { importId: `imp-${name}`, reopened: false, rowCount: 2, profile: 'generic', sourceName: 'Conta (formato genérico)' });
    }) as unknown as typeof fetch;

    render(<FinanceImportPage />);
    const input = screen.getByLabelText(/Selecionar arquivos CSV ou OFX/i);
    fireEvent.change(input, { target: { files: [makeFile('bom1.csv'), makeFile('ruim.csv'), makeFile('bom2.csv')] } });
    await waitFor(() => expect(screen.getByText(/3 arquivo.s. selecionado/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Processar/i }));

    await waitFor(() => expect(screen.getByText(/Resumo do lote/i)).toBeTruthy());
    const ruimItem = screen.getByText('ruim.csv').closest('li')!;
    expect(within(ruimItem).getByText(/Inválido/i)).toBeTruthy();
    const bom1Item = screen.getByText('bom1.csv').closest('li')!;
    expect(within(bom1Item).getByText(/Processado/i)).toBeTruthy();
  });

  it('um arquivo duplicado no lote não bloqueia o processamento dos outros', async () => {
    global.fetch = vi.fn(async (_url, init) => {
      const name = await getUploadedFileName(init);
      if (name === 'repetido.csv') {
        return jsonResponse(409, { error: 'Este arquivo já foi importado e confirmado para esta origem.', errorCategory: 'duplicate_import' });
      }
      return jsonResponse(200, { importId: `imp-${name}`, reopened: false, rowCount: 2, profile: 'generic', sourceName: 'Conta (formato genérico)' });
    }) as unknown as typeof fetch;

    render(<FinanceImportPage />);
    const input = screen.getByLabelText(/Selecionar arquivos CSV ou OFX/i);
    fireEvent.change(input, { target: { files: [makeFile('novo.csv'), makeFile('repetido.csv')] } });
    await waitFor(() => expect(screen.getByText(/2 arquivo.s. selecionado/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Processar/i }));

    await waitFor(() => expect(screen.getByText(/Resumo do lote/i)).toBeTruthy());
    expect(screen.getByText('repetido.csv').closest('li')!.textContent).toMatch(/Duplicado/i);
    expect(screen.getByText('novo.csv').closest('li')!.textContent).toMatch(/Processado/i);
  });

  it('reconhece dois perfis Nubank diferentes no mesmo lote e exibe o status correto de cada um', async () => {
    global.fetch = vi.fn(async (_url, init) => {
      const name = await getUploadedFileName(init);
      if (name === 'fatura.csv') {
        return jsonResponse(200, { importId: 'imp-card', reopened: false, rowCount: 3, profile: 'nubank_credit_card_statement', sourceName: 'Nubank • Cartão' });
      }
      return jsonResponse(200, { importId: 'imp-account', reopened: false, rowCount: 5, profile: 'nubank_account_statement', sourceName: 'Nubank • Conta' });
    }) as unknown as typeof fetch;

    render(<FinanceImportPage />);
    const input = screen.getByLabelText(/Selecionar arquivos CSV ou OFX/i);
    fireEvent.change(input, { target: { files: [makeFile('fatura.csv'), makeFile('extrato.csv')] } });
    await waitFor(() => expect(screen.getByText(/2 arquivo.s. selecionado/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Processar/i }));

    await waitFor(() => expect(screen.getByText(/Resumo do lote/i)).toBeTruthy());
    expect(screen.getByText('fatura.csv').closest('li')!.textContent).toMatch(/Reconhecido como fatura Nubank/i);
    expect(screen.getByText('extrato.csv').closest('li')!.textContent).toMatch(/Reconhecido como extrato Nubank/i);
  });

  it('resumo do lote consolida totais e leva o usuário à revisão em fila', async () => {
    global.fetch = vi.fn(async (_url, init) => {
      const name = await getUploadedFileName(init);
      const map: Record<string, unknown> = {
        'fatura.csv': { importId: 'imp-card', reopened: false, rowCount: 3, profile: 'nubank_credit_card_statement', sourceName: 'Nubank • Cartão' },
        'extrato.csv': { importId: 'imp-account', reopened: false, rowCount: 5, profile: 'nubank_account_statement', sourceName: 'Nubank • Conta' },
      };
      return jsonResponse(200, map[name]);
    }) as unknown as typeof fetch;

    render(<FinanceImportPage />);
    const input = screen.getByLabelText(/Selecionar arquivos CSV ou OFX/i);
    fireEvent.change(input, { target: { files: [makeFile('fatura.csv'), makeFile('extrato.csv')] } });
    await waitFor(() => expect(screen.getByText(/2 arquivo.s. selecionado/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Processar/i }));

    await waitFor(() => expect(screen.getByText(/8 lançamento\(s\) encontrado/i)).toBeTruthy());
    const reviewButton = screen.getByRole('button', { name: /Ir para revisão/i });
    fireEvent.click(reviewButton);
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/financas\/revisao\/imp-card\?queue=imp-card,imp-account&pos=0$/));
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { CategoryManager } from '@/components/finance-cash/category-manager';
import { DEFAULT_CATEGORIES } from '@/modules/finance/cash/domain/categories';

const cmds = {
  createCategory: vi.fn(async () => 'nova'),
  renameCategory: vi.fn(async () => undefined),
  deleteCategory: vi.fn(async () => undefined),
  countCategoryUse: vi.fn(async () => 3),
};
vi.mock('@/providers/repository.provider', () => ({ useCommands: () => ({ financeCash: cmds }) }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const open = () => {
  const { container } = render(<CategoryManager categories={[...DEFAULT_CATEGORIES]} persisted />);
  (container.querySelector('details') as HTMLDetailsElement).open = true;
};

describe('gerenciador de categorias', () => {
  it('lista as categorias iniciais com renomear e excluir em cada uma (inclusive as predefinidas)', () => {
    open();
    expect(screen.getByLabelText('Renomear Mercado')).toBeTruthy();
    expect(screen.getByLabelText('Excluir Outros')).toBeTruthy();
    expect(screen.getByText(/ponto de partida/i)).toBeTruthy();
  });

  it('cria uma categoria nova', async () => {
    open();
    fireEvent.change(screen.getByLabelText('Nome da nova categoria'), { target: { value: 'Armazenamento' } });
    fireEvent.click(screen.getByText('Criar'));
    await waitFor(() => expect(cmds.createCategory).toHaveBeenCalledWith('Armazenamento'));
  });

  it('renomeia mantendo o mesmo id (só o nome vai para o comando)', async () => {
    open();
    fireEvent.click(screen.getByLabelText('Renomear Mercado'));
    fireEvent.change(screen.getByLabelText('Novo nome de Mercado'), { target: { value: 'Supermercado' } });
    fireEvent.click(screen.getByText('Salvar'));
    await waitFor(() => expect(cmds.renameCategory).toHaveBeenCalledWith('groceries', 'Supermercado'));
  });

  it('excluir pergunta, mostra quantos lançamentos usam e NÃO exige substituta (padrão: ficam sem categoria)', async () => {
    open();
    fireEvent.click(screen.getByLabelText('Excluir Lazer'));
    expect(await screen.findByText(/3 lançamentos usam esta categoria/)).toBeTruthy();
    const select = screen.getByLabelText(/Mover para outra categoria/) as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(screen.getByText(/Nenhuma — ficam/)).toBeTruthy();
    expect(screen.getByText(/regras aprendidas desta categoria também serão excluídas/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir categoria' }));
    await waitFor(() => expect(cmds.deleteCategory).toHaveBeenCalledWith('leisure', null));
  });

  it('com substituta escolhida (opcional) ela é enviada e as regras seguem para ela', async () => {
    open();
    fireEvent.click(screen.getByLabelText('Excluir Lazer'));
    const select = (await screen.findByLabelText(/Mover para outra categoria/)) as HTMLSelectElement;
    expect([...select.options].some((o) => o.value === 'leisure')).toBe(false); // não oferece a própria
    fireEvent.change(select, { target: { value: 'other' } });
    expect(screen.getByText(/regras aprendidas desta categoria passam para a escolhida/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir categoria' }));
    await waitFor(() => expect(cmds.deleteCategory).toHaveBeenCalledWith('leisure', 'other'));
  });

  it('antes da atualização do banco as edições ficam desativadas com aviso', () => {
    const { container } = render(<CategoryManager categories={[...DEFAULT_CATEGORIES]} persisted={false} />);
    (container.querySelector('details') as HTMLDetailsElement).open = true;
    expect(screen.getByRole('status').textContent).toMatch(/atualização do banco/);
    expect((screen.getByLabelText('Renomear Mercado') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Excluir Mercado') as HTMLButtonElement).disabled).toBe(true);
  });
});

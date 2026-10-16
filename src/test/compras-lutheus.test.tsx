// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import ComprasPage from '@/app/compras/page';
import type { Item } from '@/modules/items/domain/item.schema';

const LIST = {
  id: '11111111-1111-4111-8111-111111111111',
  workspaceId: 'ws-1',
  slug: 'mercado',
  name: 'Mercado',
  createdAt: '2026-07-31T10:00:00.000Z',
  updatedAt: '2026-07-31T10:00:00.000Z',
};
const fakeRepo = { subscribe: () => () => {} };

function item(over: Partial<Item>): Item {
  return {
    id: crypto.randomUUID(),
    workspaceId: 'ws-1',
    type: 'shopping_item',
    status: 'organized',
    priority: 'normal',
    source: 'manual',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    shoppingListId: LIST.id,
    ...over,
  } as Item;
}

let board: { list: typeof LIST; pending: Item[]; purchased: Item[]; history?: { title: string; createdAt: string }[] }[];
const createItem = vi.fn<(dto: unknown) => Promise<Item>>(async () => item({}));

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
    changeNotifier: { subscribe: () => () => {} },
  }),
  useQueries: () => ({ shopping: { getBoard: async () => board } }),
  useCommands: () => ({
    item: { createItem, updateItem: vi.fn(), completeItem: vi.fn(), reopenItem: vi.fn(), archiveItem: vi.fn() },
    shopping: { ensureDefaultLists: async () => [LIST] },
  }),
}));
vi.mock('@/providers/auth.provider', () => ({ useWorkspace: () => ({ workspaceId: 'ws-1' }) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ whatsappNumber: null }) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const hist = (title: string, d: string) => ({ title, createdAt: `2026-${d}T10:00:00.000Z` });
const firstArg = () => createItem.mock.calls[0][0] as Record<string, unknown>;

describe('Compras — Lutheus', () => {
  it('itens comprados ficam recolhidos por padrão e o histórico continua disponível', async () => {
    board = [{ list: LIST, pending: [item({ title: 'Pão' })], purchased: [item({ title: 'Arroz', status: 'completed' })] }];
    render(<ComprasPage />);
    const details = (await screen.findByText(/Comprados \(1\)/)).closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByText('Arroz')).toBeTruthy();
    expect(screen.getByLabelText('Itens de Mercado').textContent).toContain('Pão');
    expect(screen.getByLabelText('Itens de Mercado').textContent).not.toContain('Arroz');
  });

  it('erro de digitação: pergunta antes de adicionar; aceitar usa a grafia conhecida', async () => {
    board = [{ list: LIST, pending: [], purchased: [], history: [hist('Leite', '09-01'), hist('Leite', '09-08')] }];
    render(<ComprasPage />);
    const input = await screen.findByLabelText(/Adicionar item em Mercado/i);
    fireEvent.change(input, { target: { value: 'Leitte' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    await screen.findByText(/Acho que você quis dizer/);
    expect(createItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Usar .Leite./ }));
    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(firstArg()).toMatchObject({ title: 'Leite' });
  });

  it('erro de digitação: dá para manter exatamente o que foi digitado', async () => {
    board = [{ list: LIST, pending: [], purchased: [], history: [hist('Leite', '09-01')] }];
    render(<ComprasPage />);
    fireEvent.change(await screen.findByLabelText(/Adicionar item em Mercado/i), { target: { value: 'Leitte' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    fireEvent.click(await screen.findByRole('button', { name: /Manter .Leitte./ }));
    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(firstArg()).toMatchObject({ title: 'Leitte' });
  });

  it('item novo e diferente é adicionado direto, sem pergunta', async () => {
    board = [{ list: LIST, pending: [], purchased: [], history: [hist('Leite', '09-01')] }];
    render(<ComprasPage />);
    fireEvent.change(await screen.findByLabelText(/Adicionar item em Mercado/i), { target: { value: 'Queijo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Acho que você quis dizer/)).toBeNull();
  });

  it('recorrentes aparecem como atalhos e um toque adiciona', async () => {
    board = [{ list: LIST, pending: [], purchased: [], history: [hist('Café', '08-01'), hist('Café', '08-10'), hist('Café', '08-20')] }];
    render(<ComprasPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Café/ }));
    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(firstArg()).toMatchObject({ title: 'Café', shoppingListId: LIST.id });
  });

  it('o que já está pendente não vira sugestão', async () => {
    board = [
      {
        list: LIST,
        pending: [item({ title: 'Café' })],
        purchased: [],
        history: [hist('Café', '08-01'), hist('Café', '08-10'), hist('Café', '08-20')],
      },
    ];
    render(<ComprasPage />);
    await screen.findByLabelText('Itens de Mercado');
    expect(screen.queryByLabelText('Sugestões')).toBeNull();
  });
});

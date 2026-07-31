// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import ComprasPage from '@/app/compras/page';
import type { Item } from '@/modules/items/domain/item.schema';
import type { ShoppingList } from '@/modules/shopping/domain/shopping-list.schema';

/**
 * Comportamento real da página /compras: alternância de listas, inclusão
 * rápida com foco preservado, marcar/desmarcar, editar, mover, excluir,
 * limpar comprados e o botão de WhatsApp habilitado/desabilitado — sem
 * chamadas reais ao Supabase (Commands/Queries mockados, mesmo padrão de
 * projetos-page-filters.test.tsx).
 */

const MERCADO: ShoppingList = {
  id: '11111111-1111-4111-8111-111111111111',
  workspaceId: 'ws-1',
  slug: 'mercado',
  name: 'Mercado',
  createdAt: '2026-07-31T10:00:00.000Z',
  updatedAt: '2026-07-31T10:00:00.000Z',
};
const INTERNET: ShoppingList = {
  id: '22222222-2222-4222-8222-222222222222',
  workspaceId: 'ws-1',
  slug: 'internet',
  name: 'Internet',
  createdAt: '2026-07-31T10:00:00.000Z',
  updatedAt: '2026-07-31T10:00:00.000Z',
};

function makeItem(overrides: Partial<Item>): Item {
  return {
    id: crypto.randomUUID(),
    workspaceId: 'ws-1',
    type: 'shopping_item',
    status: 'organized',
    priority: 'normal',
    source: 'manual',
    createdAt: '2026-07-31T10:00:00.000Z',
    updatedAt: '2026-07-31T10:00:00.000Z',
    shoppingListId: MERCADO.id,
    ...overrides,
  };
}

let items: Item[] = [];
let listeners: Array<() => void> = [];
function notifyAll() {
  listeners.forEach((l) => l());
}
const fakeRepo = {
  subscribe: (fn: () => void) => {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  },
};

function computeBoard() {
  return [MERCADO, INTERNET].map((list) => {
    const forList = items.filter((i) => i.shoppingListId === list.id && i.status !== 'archived');
    return {
      list,
      pending: forList.filter((i) => i.status !== 'completed').sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      purchased: forList.filter((i) => i.status === 'completed'),
    };
  });
}

const getBoard = vi.fn(async () => computeBoard());
const ensureDefaultLists = vi.fn(async () => [MERCADO, INTERNET]);
const createItem = vi.fn(async (dto: Partial<Item>) => {
  const item = makeItem({ title: dto.title, shoppingListId: dto.shoppingListId });
  items.push(item);
  notifyAll();
  return item;
});
const updateItem = vi.fn(async (id: string, patch: Partial<Item>) => {
  items = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
  notifyAll();
});
const completeItem = vi.fn(async (id: string) => {
  items = items.map((i) => (i.id === id ? { ...i, status: 'completed' as const, completedAt: '2026-07-31T11:00:00.000Z' } : i));
  notifyAll();
});
const reopenItem = vi.fn(async (id: string) => {
  items = items.map((i) => (i.id === id ? { ...i, status: 'organized' as const, completedAt: undefined } : i));
  notifyAll();
});
const archiveItem = vi.fn(async (id: string) => {
  items = items.map((i) => (i.id === id ? { ...i, status: 'archived' as const } : i));
  notifyAll();
});

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
  useQueries: () => ({
    shopping: { getBoard },
  }),
  useCommands: () => ({
    item: { createItem, updateItem, completeItem, reopenItem, archiveItem },
    shopping: { ensureDefaultLists },
  }),
}));

vi.mock('@/providers/auth.provider', () => ({
  useWorkspace: () => ({ workspaceId: 'ws-1' }),
}));

beforeEach(() => {
  items = [];
  listeners = [];
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ whatsappNumber: '+55 48 98816-5106' }) }))
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ComprasPage', () => {
  it('estado vazio: mensagem curta quando a lista não tem itens', async () => {
    render(<ComprasPage />);
    await waitFor(() => expect(screen.getByText(/Nenhum item em Mercado/i)).toBeTruthy());
  });

  it('adiciona um item, limpa e mantém o foco no campo', async () => {
    render(<ComprasPage />);
    const input = await screen.findByLabelText(/Adicionar item em Mercado/i);
    fireEvent.change(input, { target: { value: 'Leite' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(createItem.mock.calls[0][0]).toMatchObject({
      title: 'Leite',
      type: 'shopping_item',
      shoppingListId: MERCADO.id,
      skipInbox: true,
    });
    await waitFor(() => expect(screen.getByText('Leite')).toBeTruthy());
    expect((input as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(input);
  });

  it('marcar como comprado move o item para o grupo de comprados', async () => {
    items = [makeItem({ id: 'i1', title: 'Arroz' })];
    render(<ComprasPage />);

    const checkbox = await screen.findByLabelText(/Marcar Arroz como comprado/i);
    fireEvent.click(checkbox);

    await waitFor(() => expect(completeItem).toHaveBeenCalledWith('i1'));
    await waitFor(() => expect(screen.getByLabelText(/Desmarcar Arroz como comprado/i)).toBeTruthy());
  });

  it('edita o título de um item', async () => {
    items = [makeItem({ id: 'i1', title: 'Arroz' })];
    render(<ComprasPage />);

    fireEvent.click(await screen.findByLabelText('Editar Arroz'));
    const editInput = screen.getByLabelText('Editar item');
    fireEvent.change(editInput, { target: { value: 'Arroz integral' } });
    fireEvent.keyDown(editInput, { key: 'Enter' });

    await waitFor(() => expect(updateItem).toHaveBeenCalledWith('i1', { title: 'Arroz integral' }));
  });

  it('exclui um item após confirmação', async () => {
    items = [makeItem({ id: 'i1', title: 'Arroz' })];
    vi.stubGlobal('confirm', vi.fn(() => true));
    render(<ComprasPage />);

    fireEvent.click(await screen.findByLabelText('Excluir Arroz'));
    await waitFor(() => expect(archiveItem).toHaveBeenCalledWith('i1'));
  });

  it('não exclui quando a confirmação é cancelada', async () => {
    items = [makeItem({ id: 'i1', title: 'Arroz' })];
    vi.stubGlobal('confirm', vi.fn(() => false));
    render(<ComprasPage />);

    fireEvent.click(await screen.findByLabelText('Excluir Arroz'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(archiveItem).not.toHaveBeenCalled();
  });

  it('move um item para Internet', async () => {
    items = [makeItem({ id: 'i1', title: 'Arroz' })];
    render(<ComprasPage />);

    const select = await screen.findByLabelText(/Mover Arroz para outra lista/i);
    fireEvent.change(select, { target: { value: INTERNET.id } });

    await waitFor(() => expect(updateItem).toHaveBeenCalledWith('i1', { shoppingListId: INTERNET.id }));
  });

  it('limpa os comprados após confirmação', async () => {
    items = [makeItem({ id: 'i1', title: 'Arroz', status: 'completed', completedAt: '2026-07-31T11:00:00.000Z' })];
    vi.stubGlobal('confirm', vi.fn(() => true));
    render(<ComprasPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Limpar comprados/i }));
    await waitFor(() => expect(archiveItem).toHaveBeenCalledWith('i1'));
  });

  it('botão de WhatsApp habilitado quando há número e itens pendentes', async () => {
    items = [makeItem({ id: 'i1', title: 'Arroz' })];
    render(<ComprasPage />);

    const link = await screen.findByRole('link', { name: /Enviar pelo WhatsApp/i });
    expect(link.getAttribute('href')).toContain('https://wa.me/5548988165106');
  });

  it('botão de WhatsApp desabilitado sem itens pendentes', async () => {
    render(<ComprasPage />);
    await waitFor(() => expect(screen.getByText(/Nenhum item em Mercado/i)).toBeTruthy());
    const button = screen.getByRole('button', { name: /Enviar pelo WhatsApp/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('botão de WhatsApp desabilitado sem número configurado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ whatsappNumber: null }) })));
    items = [makeItem({ id: 'i1', title: 'Arroz' })];
    render(<ComprasPage />);

    await waitFor(() => expect(screen.getByText('Arroz')).toBeTruthy());
    const button = screen.getByRole('button', { name: /Enviar pelo WhatsApp/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('alterna entre Mercado e Internet', async () => {
    items = [
      makeItem({ id: 'i1', title: 'Arroz', shoppingListId: MERCADO.id }),
      makeItem({ id: 'i2', title: 'Hospedagem', shoppingListId: INTERNET.id }),
    ];
    render(<ComprasPage />);

    await waitFor(() => expect(screen.getByText('Arroz')).toBeTruthy());
    expect(screen.queryByText('Hospedagem')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /Internet/i }));
    await waitFor(() => expect(screen.getByText('Hospedagem')).toBeTruthy());
    expect(screen.queryByText('Arroz')).toBeNull();
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ItemCommands } from '@/modules/items/application/item.commands';
import { LocalStorageItemRepository } from '@/modules/items/infrastructure/local-storage-item.repository';
import { LocalStorageEventRepository } from '@/platform/events/local-storage-event.repository';
import { ShoppingQueries } from '@/modules/shopping/application/shopping.queries';
import type { ShoppingListRepository, EnsureDefaultListsResult } from '@/modules/shopping/application/shopping-list.repository';
import type { ShoppingList } from '@/modules/shopping/domain/shopping-list.schema';

/**
 * ShoppingQueries.getBoard(): agrupamento pendente/comprado por lista,
 * ordenação estável, exclusão de arquivados e de itens de outra lista.
 * Usa LocalStorageItemRepository (real) + uma lista de compras em memória —
 * sem Supabase, mesmo padrão de item-lifecycle.test.ts.
 */

class InMemoryShoppingListRepository implements ShoppingListRepository {
  constructor(private lists: ShoppingList[]) {}
  async findAll(): Promise<ShoppingList[]> {
    return this.lists;
  }
  async ensureDefaultLists(): Promise<EnsureDefaultListsResult> {
    return { lists: this.lists, created: [] };
  }
  subscribe(): () => void {
    return () => {};
  }
}

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

beforeEach(() => {
  const store: Record<string, string> = {};
  const mockStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
  vi.stubGlobal('window', { localStorage: mockStorage, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('localStorage', mockStorage);
});

function setup() {
  const itemRepo = new LocalStorageItemRepository();
  const eventRepo = new LocalStorageEventRepository();
  const itemCmds = new ItemCommands(itemRepo, eventRepo);
  const listRepo = new InMemoryShoppingListRepository([MERCADO, INTERNET]);
  const queries = new ShoppingQueries(listRepo, itemRepo);
  return { itemCmds, queries };
}

describe('ShoppingQueries.getBoard', () => {
  it('agrupa itens pendentes e comprados por lista', async () => {
    const { itemCmds, queries } = setup();
    const leite = await itemCmds.createItem(
      { title: 'Leite', type: 'shopping_item', skipInbox: true, shoppingListId: MERCADO.id },
      'ws-1'
    );
    await itemCmds.createItem(
      { title: 'Hospedagem', type: 'shopping_item', skipInbox: true, shoppingListId: INTERNET.id },
      'ws-1'
    );
    await itemCmds.completeItem(leite.id);

    const board = await queries.getBoard();
    const mercado = board.find((b) => b.list.slug === 'mercado')!;
    const internet = board.find((b) => b.list.slug === 'internet')!;

    expect(mercado.purchased.map((i) => i.title)).toEqual(['Leite']);
    expect(mercado.pending).toHaveLength(0);
    expect(internet.pending.map((i) => i.title)).toEqual(['Hospedagem']);
    expect(internet.purchased).toHaveLength(0);
  });

  it('ordena pendentes por ordem de criação (mais antigo primeiro)', async () => {
    const { itemCmds, queries } = setup();
    await itemCmds.createItem({ title: 'Arroz', type: 'shopping_item', skipInbox: true, shoppingListId: MERCADO.id }, 'ws-1');
    await itemCmds.createItem({ title: 'Feijão', type: 'shopping_item', skipInbox: true, shoppingListId: MERCADO.id }, 'ws-1');
    await itemCmds.createItem({ title: 'Café', type: 'shopping_item', skipInbox: true, shoppingListId: MERCADO.id }, 'ws-1');

    const board = await queries.getBoard();
    const mercado = board.find((b) => b.list.slug === 'mercado')!;
    expect(mercado.pending.map((i) => i.title)).toEqual(['Arroz', 'Feijão', 'Café']);
  });

  it('itens arquivados (excluídos) não aparecem em nenhum grupo', async () => {
    const { itemCmds, queries } = setup();
    const item = await itemCmds.createItem(
      { title: 'Descontinuado', type: 'shopping_item', skipInbox: true, shoppingListId: MERCADO.id },
      'ws-1'
    );
    await itemCmds.archiveItem(item.id);

    const board = await queries.getBoard();
    const mercado = board.find((b) => b.list.slug === 'mercado')!;
    expect(mercado.pending).toHaveLength(0);
    expect(mercado.purchased).toHaveLength(0);
  });

  it('itens de outro tipo (task) não entram na lista de compras', async () => {
    const { itemCmds, queries } = setup();
    await itemCmds.createItem({ title: 'Ligar para cliente', type: 'task' }, 'ws-1');

    const board = await queries.getBoard();
    const total = board.reduce((sum, b) => sum + b.pending.length + b.purchased.length, 0);
    expect(total).toBe(0);
  });

  it('mover um item para outra lista reflete na próxima leitura', async () => {
    const { itemCmds, queries } = setup();
    const item = await itemCmds.createItem(
      { title: 'Detergente', type: 'shopping_item', skipInbox: true, shoppingListId: MERCADO.id },
      'ws-1'
    );
    await itemCmds.updateItem(item.id, { shoppingListId: INTERNET.id });

    const board = await queries.getBoard();
    const mercado = board.find((b) => b.list.slug === 'mercado')!;
    const internet = board.find((b) => b.list.slug === 'internet')!;
    expect(mercado.pending).toHaveLength(0);
    expect(internet.pending.map((i) => i.title)).toEqual(['Detergente']);
  });
});

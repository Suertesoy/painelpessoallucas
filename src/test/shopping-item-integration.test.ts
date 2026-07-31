import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ItemCommands } from '@/modules/items/application/item.commands';
import { ItemQueries } from '@/modules/items/application/item.queries';
import { LocalStorageItemRepository } from '@/modules/items/infrastructure/local-storage-item.repository';
import { LocalStorageEventRepository } from '@/platform/events/local-storage-event.repository';

/**
 * Mudanças no domínio `items` feitas para viabilizar a lista de compras:
 * (1) `skipInbox` — exceção estreita a "captura primeiro, organizar depois"
 *     só para item adicionado direto numa lista (já nasce organizado);
 * (2) `shopping_item` nunca aparece em "Itens organizados sem projeto"
 *     (Revisão) — ele nunca tem projeto por design, não é uma omissão.
 */

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

describe('ItemCommands.createItem — skipInbox', () => {
  it('sem skipInbox, comportamento padrão é inalterado: nasce em inbox', async () => {
    const itemRepo = new LocalStorageItemRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new ItemCommands(itemRepo, eventRepo);

    const item = await commands.createItem({ title: 'Tarefa qualquer', type: 'task' }, 'ws-1');
    expect(item.status).toBe('inbox');
  });

  it('com skipInbox, nasce organized (usado pela inclusão rápida de compras)', async () => {
    const itemRepo = new LocalStorageItemRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new ItemCommands(itemRepo, eventRepo);

    const item = await commands.createItem(
      { title: 'Leite', type: 'shopping_item', skipInbox: true },
      'ws-1'
    );
    expect(item.status).toBe('organized');
  });
});

describe('ItemQueries.getReviewOverview — noProject nunca inclui shopping_item', () => {
  it('shopping_item organizado sem projeto não aparece em "sem projeto"', async () => {
    const itemRepo = new LocalStorageItemRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new ItemCommands(itemRepo, eventRepo);
    const queries = new ItemQueries(itemRepo);

    await commands.createItem({ title: 'Leite', type: 'shopping_item', skipInbox: true }, 'ws-1');
    const overview = await queries.getReviewOverview();

    expect(overview.noProject.some((i) => i.type === 'shopping_item')).toBe(false);
  });

  it('tarefa organizada sem projeto continua aparecendo (comportamento preservado)', async () => {
    const itemRepo = new LocalStorageItemRepository();
    const eventRepo = new LocalStorageEventRepository();
    const commands = new ItemCommands(itemRepo, eventRepo);
    const queries = new ItemQueries(itemRepo);

    const task = await commands.createItem({ title: 'Revisar contrato', type: 'task' }, 'ws-1');
    await commands.updateItem(task.id, { status: 'organized' });
    const overview = await queries.getReviewOverview();

    expect(overview.noProject.some((i) => i.id === task.id)).toBe(true);
  });
});

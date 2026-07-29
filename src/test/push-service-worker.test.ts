import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';

/**
 * Testa o comportamento real de push/notificationclick em `public/sw.js`,
 * executando o arquivo de verdade num escopo simulado (mesma técnica de
 * sw-cache-policy.test.ts) — não uma reimplementação em TypeScript.
 */

const SW_SOURCE = fs.readFileSync(path.resolve(__dirname, '../../public/sw.js'), 'utf-8');
const ORIGIN = 'https://painel-lucas.example';

function loadServiceWorker(opts: { existingClients?: { url: string; focus: ReturnType<typeof vi.fn>; navigate?: ReturnType<typeof vi.fn> }[] } = {}) {
  const listeners: Record<string, ((event: unknown) => unknown)[]> = {};
  const showNotification = vi.fn(async () => {});
  const matchAll = vi.fn(async () => opts.existingClients ?? []);
  const openWindow = vi.fn(async () => {});

  const selfMock = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, cb: (event: unknown) => unknown) => {
      (listeners[type] ??= []).push(cb);
    },
    registration: { showNotification },
    clients: { claim: vi.fn(async () => {}), matchAll, openWindow },
    skipWaiting: vi.fn(),
  };

  const cachesMock = {
    open: vi.fn(async () => ({ addAll: vi.fn(), put: vi.fn(), match: vi.fn() })),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
    match: vi.fn(async () => undefined),
  };

  const fetchMock = vi.fn(async () => ({ clone: () => ({}), ok: true }));

  const runInSwScope = new Function('self', 'caches', 'fetch', 'URL', SW_SOURCE);
  runInSwScope(selfMock, cachesMock, fetchMock, URL);

  async function emit(type: string, event: Record<string, unknown>) {
    const handlers = listeners[type] ?? [];
    for (const handler of handlers) await handler(event);
  }

  return { emit, showNotification, matchAll, openWindow, selfMock };
}

function makeWaitUntilEvent(extra: Record<string, unknown> = {}) {
  const waits: Promise<unknown>[] = [];
  return { event: { waitUntil: (p: Promise<unknown>) => waits.push(p), ...extra }, waits };
}

function makePushEvent(payload: unknown, invalidJson = false) {
  const data = payload === undefined ? null : { json: () => (invalidJson ? (() => { throw new Error('bad json'); })() : payload) };
  return makeWaitUntilEvent({ data });
}

describe('service worker — push', () => {
  it('exibe a notificação com o conteúdo do payload (título, corpo, tag, url)', async () => {
    const sw = loadServiceWorker();
    const { event, waits } = makePushEvent({ title: 'Lembrete', body: 'Ligar para o dentista', url: '/entrada?item=i1', tag: 'task_reminder:r1' });

    await sw.emit('push', event);
    await Promise.all(waits);

    expect(sw.showNotification).toHaveBeenCalledWith('Lembrete', {
      body: 'Ligar para o dentista',
      tag: 'task_reminder:r1',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: '/entrada?item=i1' },
    });
  });

  it('payload ausente: mostra notificação genérica segura', async () => {
    const sw = loadServiceWorker();
    const { event, waits } = makePushEvent(undefined);

    await sw.emit('push', event);
    await Promise.all(waits);

    expect(sw.showNotification).toHaveBeenCalledWith(
      'Painel Lucas',
      expect.objectContaining({ body: 'Você tem um lembrete para revisar.', data: { url: '/' } })
    );
  });

  it('payload com JSON inválido: mostra notificação genérica sem quebrar o evento', async () => {
    const sw = loadServiceWorker();
    const { event, waits } = makePushEvent(null, true);

    await expect(sw.emit('push', event)).resolves.not.toThrow();
    await Promise.all(waits);

    expect(sw.showNotification).toHaveBeenCalledWith('Painel Lucas', expect.objectContaining({ data: { url: '/' } }));
  });

  it('rejeita URL externa no payload — nunca abre outra origem', async () => {
    const sw = loadServiceWorker();
    const { event, waits } = makePushEvent({ title: 'X', body: 'Y', url: 'https://evil.example/phish' });

    await sw.emit('push', event);
    await Promise.all(waits);

    expect(sw.showNotification).toHaveBeenCalledWith('X', expect.objectContaining({ data: { url: '/' } }));
  });

  it('rejeita URL protocol-relative (//evil.example)', async () => {
    const sw = loadServiceWorker();
    const { event, waits } = makePushEvent({ title: 'X', body: 'Y', url: '//evil.example' });

    await sw.emit('push', event);
    await Promise.all(waits);

    expect(sw.showNotification).toHaveBeenCalledWith('X', expect.objectContaining({ data: { url: '/' } }));
  });
});

describe('service worker — notificationclick', () => {
  it('fecha a notificação e foca uma janela existente, navegando para a rota certa', async () => {
    const navigate = vi.fn(async () => {});
    const focus = vi.fn(async () => {});
    const sw = loadServiceWorker({ existingClients: [{ url: `${ORIGIN}/hoje`, focus, navigate }] });

    const close = vi.fn();
    const { event, waits } = makeWaitUntilEvent({ notification: { close, data: { url: '/entrada?item=i1' } } });

    await sw.emit('notificationclick', event);
    await Promise.all(waits);

    expect(close).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(`${ORIGIN}/entrada?item=i1`);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it('sem janela existente: abre uma nova', async () => {
    const sw = loadServiceWorker({ existingClients: [] });
    const { event, waits } = makeWaitUntilEvent({
      notification: { close: vi.fn(), data: { url: '/hoje' } },
    });

    await sw.emit('notificationclick', event);
    await Promise.all(waits);

    expect(sw.openWindow).toHaveBeenCalledWith(`${ORIGIN}/hoje`);
  });

  it('notificação sem data.url definido: usa "/" como destino padrão', async () => {
    const sw = loadServiceWorker({ existingClients: [] });
    const { event, waits } = makeWaitUntilEvent({ notification: { close: vi.fn(), data: null } });

    await sw.emit('notificationclick', event);
    await Promise.all(waits);

    expect(sw.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
  });
});

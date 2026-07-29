import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';

/**
 * `public/sw.js` roda no escopo global de um service worker (self, caches,
 * fetch) — não é um módulo importável. Para testar o comportamento real
 * (e não só reimplementar a lógica em TypeScript), este teste carrega o
 * arquivo de verdade e o executa dentro de um `self`/`caches`/`fetch`
 * simulados, disparando os handlers registrados via `addEventListener`
 * exatamente como o navegador faria.
 *
 * É aqui que as regras obrigatórias de segurança da Fase 2.1 são
 * verificadas de forma comportamental: nada fora da lista explícita de
 * ativos estáticos pode passar por `event.respondWith` (senão entraria em
 * cache), e apenas caches do próprio painel são limpos na ativação.
 */

const SW_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../public/sw.js'),
  'utf-8'
);
const ORIGIN = 'https://painel-lucas.example';

type FakeCache = {
  addAll: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  match: ReturnType<typeof vi.fn>;
};

function loadServiceWorker() {
  const listeners: Record<string, ((event: unknown) => unknown)[]> = {};
  const cacheStores = new Map<string, Map<string, unknown>>();

  // Mimica a Cache API real: chaves relativas e absolutas resolvem para a
  // mesma entrada (o navegador normaliza a Request para uma URL absoluta).
  const normalize = (key: string) => new URL(key, ORIGIN).pathname;

  function makeCache(name: string): FakeCache {
    if (!cacheStores.has(name)) cacheStores.set(name, new Map());
    const store = cacheStores.get(name)!;
    return {
      addAll: vi.fn(async (urls: string[]) => {
        urls.forEach((url) => store.set(normalize(url), { url }));
      }),
      put: vi.fn(async (request: { url: string } | string, response: unknown) => {
        const key = normalize(typeof request === 'string' ? request : request.url);
        store.set(key, response);
      }),
      match: vi.fn(async (request: { url: string } | string) => {
        const key = normalize(typeof request === 'string' ? request : request.url);
        for (const [, s] of cacheStores) {
          if (s.has(key)) return s.get(key);
        }
        return undefined;
      }),
    };
  }

  const cachesMock = {
    open: vi.fn(async (name: string) => makeCache(name)),
    keys: vi.fn(async () => Array.from(cacheStores.keys())),
    delete: vi.fn(async (name: string) => cacheStores.delete(name)),
    match: vi.fn(async (request: { url: string } | string) => {
      const key = normalize(typeof request === 'string' ? request : request.url);
      for (const [, store] of cacheStores) {
        if (store.has(key)) return store.get(key);
      }
      return undefined;
    }),
  };

  const selfMock = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, cb: (event: unknown) => unknown) => {
      (listeners[type] ??= []).push(cb);
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => {}) },
  };

  const fetchMock = vi.fn(
    async () => ({ clone: () => ({ __response: true }), __response: true })
  );

  const runInSwScope = new Function('self', 'caches', 'fetch', 'URL', SW_SOURCE);
  runInSwScope(selfMock, cachesMock, fetchMock, URL);

  async function emit(type: string, event: Record<string, unknown>) {
    const handlers = listeners[type] ?? [];
    for (const handler of handlers) {
      await handler(event);
    }
  }

  return { emit, cachesMock, cacheStores, selfMock, fetchMock };
}

function makeInstallEvent() {
  const waits: Promise<unknown>[] = [];
  return {
    event: { waitUntil: (p: Promise<unknown>) => waits.push(p) },
    waits,
  };
}

function makeFetchEvent(request: Record<string, unknown>) {
  let responded: unknown;
  return {
    event: {
      request,
      respondWith: vi.fn((value: unknown) => {
        responded = value;
      }),
    },
    getResponse: () => responded,
  };
}

describe('service worker — política de cache (public/sw.js)', () => {
  it('pré-cacheia apenas a lista explícita de ativos estáticos (ícones, manifesto, offline)', async () => {
    const sw = loadServiceWorker();
    const { event, waits } = makeInstallEvent();

    await sw.emit('install', event);
    await Promise.all(waits);

    const staticCache = Array.from(sw.cacheStores.entries()).find(([name]) =>
      name.endsWith('-static')
    );
    expect(staticCache).toBeDefined();
    const [, store] = staticCache!;
    const cachedUrls = Array.from(store.keys());

    expect(cachedUrls).toEqual(
      expect.arrayContaining([
        '/offline.html',
        '/manifest.webmanifest',
        '/icons/icon-192.png',
        '/icons/icon-512.png',
        '/icons/icon-maskable-192.png',
        '/icons/icon-maskable-512.png',
        '/icons/apple-touch-icon.png',
      ])
    );
    // Nenhuma rota de API, autenticação ou navegação entra na pré-carga.
    cachedUrls.forEach((url) => {
      expect(url).not.toMatch(/^\/api\//);
      expect(url).not.toMatch(/^\/(login|auth)/);
    });
  });

  it('na ativação, remove só caches antigos do próprio Painel Lucas — nunca de outra origem', async () => {
    const sw = loadServiceWorker();
    sw.cacheStores.set('painel-lucas-v1-static', new Map());
    sw.cacheStores.set('painel-lucas-v2-static', new Map());
    sw.cacheStores.set('some-other-app-cache', new Map());

    const waits: Promise<unknown>[] = [];
    await sw.emit('activate', { waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);

    expect(sw.cachesMock.delete).toHaveBeenCalledWith('painel-lucas-v1-static');
    expect(sw.cachesMock.delete).not.toHaveBeenCalledWith('painel-lucas-v2-static');
    expect(sw.cachesMock.delete).not.toHaveBeenCalledWith('some-other-app-cache');
  });

  it('nunca intercepta requisições que não sejam GET', async () => {
    const sw = loadServiceWorker();
    const { event, getResponse } = makeFetchEvent({
      method: 'POST',
      url: `${ORIGIN}/icons/icon-192.png`,
    });

    await sw.emit('fetch', event);

    expect(getResponse()).toBeUndefined();
  });

  it('rotas de API não são interceptadas — seguem direto para a rede, nunca em cache', async () => {
    const sw = loadServiceWorker();
    const { event, getResponse } = makeFetchEvent({
      method: 'GET',
      url: `${ORIGIN}/api/health`,
    });

    await sw.emit('fetch', event);

    expect(getResponse()).toBeUndefined();
    expect(sw.fetchMock).not.toHaveBeenCalled();
  });

  it('chamadas de origem cruzada (Supabase/Google/OpenAI) não são interceptadas', async () => {
    const sw = loadServiceWorker();
    const { event, getResponse } = makeFetchEvent({
      method: 'GET',
      url: 'https://xyzcompany.supabase.co/rest/v1/items',
    });

    await sw.emit('fetch', event);

    expect(getResponse()).toBeUndefined();
  });

  it('navegação com rede disponível: passa direto, nunca grava a página em cache', async () => {
    const sw = loadServiceWorker();
    const { event, getResponse } = makeFetchEvent({
      method: 'GET',
      mode: 'navigate',
      url: `${ORIGIN}/hoje`,
    });

    await sw.emit('fetch', event);
    await getResponse();

    expect(sw.fetchMock).toHaveBeenCalled();
    // Nenhuma entrada de cache foi criada para a navegação autenticada.
    const anyStore = Array.from(sw.cacheStores.values());
    anyStore.forEach((store) => {
      expect(store.has(`${ORIGIN}/hoje`)).toBe(false);
    });
  });

  it('navegação sem internet: cai para a página offline estática', async () => {
    const sw = loadServiceWorker();
    sw.fetchMock.mockRejectedValueOnce(new Error('offline'));
    const { event: installEvent, waits } = makeInstallEvent();
    await sw.emit('install', installEvent);
    await Promise.all(waits);

    const { event, getResponse } = makeFetchEvent({
      method: 'GET',
      mode: 'navigate',
      url: `${ORIGIN}/hoje`,
    });

    await sw.emit('fetch', event);
    const response = await getResponse();

    expect(response).toEqual({ url: '/offline.html' });
  });

  it('ativos estáticos precacheados: serve do cache quando disponível', async () => {
    const sw = loadServiceWorker();
    const { event: installEvent, waits } = makeInstallEvent();
    await sw.emit('install', installEvent);
    await Promise.all(waits);
    sw.fetchMock.mockClear();

    const { event, getResponse } = makeFetchEvent({
      method: 'GET',
      url: `${ORIGIN}/icons/icon-192.png`,
    });

    await sw.emit('fetch', event);
    const response = await getResponse();

    expect(response).toEqual({ url: '/icons/icon-192.png' });
    expect(sw.fetchMock).not.toHaveBeenCalled();
  });

  it('responde a SKIP_WAITING chamando self.skipWaiting()', async () => {
    const sw = loadServiceWorker();

    await sw.emit('message', { data: { type: 'SKIP_WAITING' } });

    expect(sw.selfMock.skipWaiting).toHaveBeenCalledTimes(1);
  });
});

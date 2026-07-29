/**
 * Service worker do Painel Lucas — Fase 2.1 (PWA instalável) + Fase 2.2
 * (Web Push).
 *
 * Estratégia deliberadamente conservadora: o painel guarda dados pessoais e
 * autenticados, então este service worker NUNCA armazena respostas de rede
 * dinâmicas. Ele só sabe servir do cache uma lista fixa e pequena de ativos
 * estáticos (ícones, manifesto, a própria página offline) — tudo o mais
 * (API, RSC, navegação autenticada, Supabase/Google/OpenAI) passa direto
 * para a rede, sem nunca entrar em `event.respondWith`. Push também não usa
 * o cache: cada notificação é exibida via `registration.showNotification`.
 *
 * Bump manual de CACHE_VERSION sempre que este arquivo mudar de forma que
 * exija invalidar o cache antigo — é o que aciona a detecção de "nova
 * versão" no cliente (comparação de bytes do próprio arquivo pelo navegador).
 */
const CACHE_VERSION = 'painel-lucas-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const OFFLINE_URL = '/offline.html';

// Lista exaustiva e explícita — nada fora daqui é armazenado em cache.
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      // Não chama skipWaiting aqui de propósito: a nova versão fica em
      // espera até o usuário confirmar "Atualizar agora" na interface.
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            // Só mexe em caches do próprio Painel Lucas, nunca de outro
            // sistema/origem que porventura compartilhe o mesmo navegador.
            .filter((key) => key.startsWith('painel-lucas-') && key !== STATIC_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isPrecachedRequest(url) {
  return url.origin === self.location.origin && PRECACHE_URLS.includes(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Nunca intercepta métodos que não sejam leitura simples.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Navegação de página: nunca cacheia o HTML (pode conter dados pessoais
  // renderizados no servidor). Tenta a rede; só cai para a página offline
  // estática quando a rede falha de verdade (sem internet).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Fora da lista explícita de ativos estáticos (ícones, manifesto, página
  // offline): não intercepta. Isso cobre /api/*, /auth/*, RSC payloads,
  // chamadas ao Supabase/Google/OpenAI e qualquer origem cruzada — tudo
  // segue direto para a rede, sem nunca passar por `respondWith`.
  if (!isPrecachedRequest(url)) return;

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
    )
  );
});

// =============================================================================
// Web Push (Fase 2.2)
// =============================================================================
// Nunca usa cache. Cada push vira uma notificação exibida via
// `registration.showNotification` — o clique navega/foca uma janela da
// própria origem ou abre uma nova, nunca uma URL externa vinda do payload.

const GENERIC_NOTIFICATION = {
  title: 'Painel Lucas',
  body: 'Você tem um lembrete para revisar.',
};

/** Só aceita caminhos internos relativos — nunca URLs de outra origem. */
function isSafeInternalPath(url) {
  if (typeof url !== 'string' || url.length === 0) return false;
  if (!url.startsWith('/')) return false;
  if (url.startsWith('//')) return false; // protocol-relative → outra origem
  if (url.includes('\\')) return false; // navegadores tratam \ como / em alguns casos
  return true;
}

function parsePushPayload(event) {
  if (!event.data) return null;
  try {
    return event.data.json();
  } catch {
    return null;
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil(handlePush(event));
});

async function handlePush(event) {
  const payload = parsePushPayload(event);

  const title =
    (payload && typeof payload.title === 'string' && payload.title.trim()) || GENERIC_NOTIFICATION.title;
  const body =
    (payload && typeof payload.body === 'string' && payload.body.trim()) || GENERIC_NOTIFICATION.body;
  const url = isSafeInternalPath(payload && payload.url) ? payload.url : '/';
  const tag =
    (payload && typeof payload.tag === 'string' && payload.tag.trim()) || 'painel-lucas-notificacao';

  await self.registration.showNotification(title, {
    body,
    tag,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url },
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(focusOrOpenWindow(isSafeInternalPath(url) ? url : '/'));
});

async function focusOrOpenWindow(path) {
  const targetUrl = new URL(path, self.location.origin).href;
  const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = allClients.find((client) => new URL(client.url).origin === self.location.origin);

  if (existing) {
    if ('navigate' in existing) {
      try {
        await existing.navigate(targetUrl);
      } catch {
        // Best-effort: alguns navegadores não suportam navigate() em todo
        // contexto — o foco ainda funciona mesmo sem a navegação.
      }
    }
    return existing.focus();
  }

  return self.clients.openWindow(targetUrl);
}

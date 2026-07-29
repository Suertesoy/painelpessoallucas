/**
 * Service worker do Painel Lucas — Fase 2.1 (PWA instalável).
 *
 * Estratégia deliberadamente conservadora: o painel guarda dados pessoais e
 * autenticados, então este service worker NUNCA armazena respostas de rede
 * dinâmicas. Ele só sabe servir do cache uma lista fixa e pequena de ativos
 * estáticos (ícones, manifesto, a própria página offline) — tudo o mais
 * (API, RSC, navegação autenticada, Supabase/Google/OpenAI) passa direto
 * para a rede, sem nunca entrar em `event.respondWith`.
 *
 * Bump manual de CACHE_VERSION sempre que este arquivo mudar de forma que
 * exija invalidar o cache antigo — é o que aciona a detecção de "nova
 * versão" no cliente (comparação de bytes do próprio arquivo pelo navegador).
 */
const CACHE_VERSION = 'painel-lucas-v1';
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

const CACHE_NAME = "sr-nk-v1.3.5";

// Núcleo pequeno: site + logins de cada área. Profissional/Admin carregam seus
// próprios módulos apenas quando acessados.
const CORE_SHELL = [
  "./",
  "./index.html",
  "./login.html",
  "./profissional/login.html",
  "./admin/login.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png?v=13.0",
  "./icons/icon-512.png?v=13.0",
  "./Fotos/Sr.NK.jpg",
  "./css/style.css",
  "./css/login.css?v=13.3",
  "./js/firebase-init.js?v=13.0",
  "./js/login.js?v=13.0",
  "./js/shared/auth-area-session.js?v=13.0",
  "./js/mobile-interactions.js?v=13.0"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(CORE_SHELL.map(async (url) => {
      try { await cache.add(url); }
      catch (error) { console.warn("[SR NK • SW] Não foi possível pré-carregar:", url, error); }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const antigos = keys.filter((key) => key !== CACHE_NAME && key.startsWith("sr-nk-"));
    const atual = await caches.open(CACHE_NAME);

    for (const key of antigos) {
      const cacheAntigo = await caches.open(key);
      const requests = await cacheAntigo.keys();
      for (const request of requests) {
        const url = new URL(request.url);
        if (!(url.pathname.endsWith(".js") || url.pathname.endsWith(".css"))) continue;
        // app.js do Profissional mudou na v1.3.5; não reaproveitar a cópia antiga.
        if (url.pathname.endsWith("/js/profissional/app.js")) continue;
        if (await atual.match(request)) continue;
        const response = await cacheAntigo.match(request);
        if (response) await atual.put(request, response);
      }
    }

    // Remove qualquer app.js antigo que tenha sido carregado durante a transição.
    for (const request of await atual.keys()) {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/js/profissional/app.js")) await atual.delete(request);
    }

    await Promise.all(antigos.map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function salvarNoCache(request, response) {
  if (!response?.ok) return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}
async function buscarRede(request) { return salvarNoCache(request, await fetch(request)); }
async function navegacaoRedePrimeiro(request) {
  try {
    return await buscarRede(request);
  } catch (_) {
    const cached = await caches.match(request, { ignoreSearch: true });
    return cached || await caches.match("./login.html") || Response.error();
  }
}
async function cachePrimeiroVersionado(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try { return await buscarRede(request); }
  catch (_) { return Response.error(); }
}
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const rede = buscarRede(request).catch(() => null);
  if (cached) { void rede; return cached; }
  return (await rede) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(navegacaoRedePrimeiro(request));
    return;
  }
  if (url.pathname.endsWith(".js") || url.pathname.endsWith(".css")) {
    event.respondWith(cachePrimeiroVersionado(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});

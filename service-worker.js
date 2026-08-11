const CACHE_NAME = "sr-nk-v3.5-hotfix-historico-v950";

// Núcleo pequeno: site + logins de cada área. Profissional/Admin carregam seus
// próprios módulos apenas quando acessados.
const CORE_SHELL = [
  "./",
  "./index.html",
  "./login.html",
  "./profissional/login.html",
  "./admin/login.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png?v=9.5",
  "./icons/icon-512.png?v=9.5",
  "./Fotos/Sr.NK.jpg",
  "./css/style.css",
  "./css/login.css?v=9.5",
  "./js/firebase-init.js?v=9.5",
  "./js/login.js?v=9.5",
  "./js/shared/auth-area-session.js?v=9.5",
  "./js/mobile-interactions.js?v=9.5"
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
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function salvarNoCache(request, response) {
  if (!response?.ok) return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}
async function buscarRede(request) { return salvarNoCache(request, await fetch(request)); }
async function navegacaoCacheImediato(request, rede) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try { return await rede; }
  catch (_) { return caches.match("./login.html"); }
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
    const rede = buscarRede(request);
    event.respondWith(navegacaoCacheImediato(request, rede));
    event.waitUntil(rede.catch(() => null));
    return;
  }
  if (url.pathname.endsWith(".js") || url.pathname.endsWith(".css")) {
    event.respondWith(cachePrimeiroVersionado(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});

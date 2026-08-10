const CACHE_NAME = "sr-nk-v2.2.0-etapa8-v830";
const NAVIGATION_TIMEOUT_MS = 1800;

const APP_SHELL = [
  "./",
  "./index.html",
  "./login.html",
  "./dashboard.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./css/dashboard.css?v=8.30",
  "./css/login.css?v=8.30",
  "./css/style.css",
  "./js/firebase-init.js?v=8.30",
  "./js/login.js?v=8.30",
  "./js/mobile-interactions.js?v=8.30",
  "./js/dashboard/index.js?v=8.30",
  "./js/dashboard/app.js?v=8.30",
  "./js/dashboard/theme.js?v=8.30",
  "./js/dashboard/connectivity.js?v=8.30",
  "./js/dashboard/navigation.js?v=8.30",
  "./js/dashboard/visao.js?v=8.30",
  "./js/dashboard/permissoes.js?v=8.30",
  "./js/dashboard/state.js?v=8.30",
  "./js/dashboard/constants.js?v=8.30",
  "./js/dashboard/primeiro-acesso.js?v=8.30",
  "./js/dashboard/services/feedback-service.js?v=8.30",
  "./js/dashboard/data/context.js?v=8.30",
  "./js/dashboard/data/configuracoes-repository.js?v=8.30",
  "./js/dashboard/data/cache-local.js?v=8.30",
  "./js/dashboard/data/read-monitor.js?v=8.30"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async (url) => {
      try {
        await cache.add(url);
      } catch (error) {
        console.warn("[SR NK • SW] Não foi possível pré-carregar:", url, error);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function salvarNoCache(request, response) {
  if (!response?.ok) return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

async function buscarRede(request) {
  const response = await fetch(request);
  return salvarNoCache(request, response);
}

async function navegacaoComTimeout(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  const rede = buscarRede(request);

  if (!cached) {
    try {
      return await rede;
    } catch (_) {
      return caches.match("./login.html");
    }
  }

  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(cached), NAVIGATION_TIMEOUT_MS);
  });

  try {
    const response = await Promise.race([
      rede.catch(() => cached),
      timeout
    ]);
    return response || cached;
  } finally {
    clearTimeout(timer);
    // Se o cache venceu a corrida, a busca de rede continua e atualiza o cache
    // silenciosamente para a próxima abertura.
    void rede.catch(() => null);
  }
}

async function cachePrimeiroVersionado(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    return await buscarRede(request);
  } catch (_) {
    return Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const rede = buscarRede(request).catch(() => null);

  if (cached) {
    void rede;
    return cached;
  }

  return (await rede) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(navegacaoComTimeout(request));
    return;
  }

  // Os arquivos JS/CSS do Sr NK usam ?v=x.y. A versão nova gera uma URL nova,
  // então podemos responder do cache imediatamente sem risco de misturar releases.
  if (url.pathname.endsWith(".js") || url.pathname.endsWith(".css")) {
    event.respondWith(cachePrimeiroVersionado(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

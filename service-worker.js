const CACHE_NAME = "sr-nk-v3.0-split-v900";
const APP_SHELL = [
  "./", "./index.html", "./login.html", "./dashboard.html",
  "./manifest.webmanifest", "./profissional/", "./profissional/index.html", "./profissional/manifest.webmanifest",
  "./admin/", "./admin/index.html", "./admin/manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./Fotos/Sr.NK.jpg",
  "./css/style.css", "./css/login.css?v=9.0", "./css/profissional.css?v=9.0", "./css/admin.css?v=9.0",
  "./js/firebase-init.js?v=9.0", "./js/login.js?v=9.0", "./js/mobile-interactions.js?v=9.0",
  "./js/profissional/index.js?v=9.0", "./js/profissional/app.js?v=9.0", "./js/profissional/navigation.js?v=9.0",
  "./js/admin/index.js?v=9.0", "./js/admin/app.js?v=9.0", "./js/admin/navigation.js?v=9.0",
  "./js/shared/theme.js?v=9.0", "./js/shared/connectivity.js?v=9.0", "./js/shared/permissoes.js?v=9.0",
  "./js/shared/state.js?v=9.0", "./js/shared/constants.js?v=9.0", "./js/shared/primeiro-acesso.js?v=9.0",
  "./js/shared/services/feedback-service.js?v=9.0", "./js/shared/services/ui-loading-service.js?v=9.0",
  "./js/shared/data/context.js?v=9.0", "./js/shared/data/configuracoes-repository.js?v=9.0",
  "./js/shared/data/cache-local.js?v=9.0", "./js/shared/data/read-monitor.js?v=9.0"
];
self.addEventListener("install", event => { event.waitUntil((async()=>{const cache=await caches.open(CACHE_NAME);await Promise.all(APP_SHELL.map(async url=>{try{await cache.add(url);}catch(error){console.warn("[SR NK • SW] Não foi possível pré-carregar:",url,error);}}));await self.skipWaiting();})()); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
async function salvarNoCache(request,response){if(!response?.ok)return response;const cache=await caches.open(CACHE_NAME);await cache.put(request,response.clone());return response;}
async function buscarRede(request){return salvarNoCache(request,await fetch(request));}
async function navegacaoCacheImediato(request,rede){const cached=await caches.match(request,{ignoreSearch:true});if(cached)return cached;try{return await rede;}catch(_){return caches.match("./login.html");}}
async function cachePrimeiroVersionado(request){const cached=await caches.match(request);if(cached)return cached;try{return await buscarRede(request);}catch(_){return Response.error();}}
async function staleWhileRevalidate(request){const cached=await caches.match(request);const rede=buscarRede(request).catch(()=>null);if(cached){void rede;return cached;}return(await rede)||Response.error();}
self.addEventListener("fetch",event=>{const request=event.request;if(request.method!=="GET")return;const url=new URL(request.url);if(url.origin!==self.location.origin)return;if(request.mode==="navigate"){const rede=buscarRede(request);event.respondWith(navegacaoCacheImediato(request,rede));event.waitUntil(rede.catch(()=>null));return;}if(url.pathname.endsWith(".js")||url.pathname.endsWith(".css")){event.respondWith(cachePrimeiroVersionado(request));return;}event.respondWith(staleWhileRevalidate(request));});

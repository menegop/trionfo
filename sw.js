/* Trionfo Ferrarese PWA: static GitHub Pages compatible, including /repository/ paths. */
'use strict';
const CACHE_PREFIX = 'trionfo-ferrarese-';
const CACHE_VERSION = 'pwa-v1-20261026';
const APP_CACHE = CACHE_PREFIX + 'shell-' + CACHE_VERSION;
const RUNTIME_CACHE = CACHE_PREFIX + 'v14-runtime-v1';
const BASE_URL = self.registration.scope;

const CORE_FILES = [
  './', './index.html', './styles.css', './game.js', './ai.js',
  './onnx_tutor.js', './app.js', './pwa.js', './manifest.webmanifest',
  './icons/trionfo-192.png', './icons/trionfo-512.png',
  './icons/trionfo-maskable-512.png', './models/model_config.json'
];
const CARD_FILES = [
  'retro_castello_ferrara.png',
  ...['coppe','bastoni','spade','denari'].flatMap(suit =>
    ['tre','due','asso','re','cavallo','fante','sette','sei','cinque','quattro'].map(rank => suit + '_' + rank + '.png'))
].map(name => './assets/cards/' + name);

// These files are downloaded by PREPARA_GITHUB_PAGES.bat BEFORE publishing.
// They remain OPTIONAL during service-worker installation, to avoid making
// the whole web application un-installable when a checkpoint is still absent.
const OFFLINE_AI = [
  './models/trionfo_v14.onnx',
  './vendor/ort.wasm.min.js',
  './vendor/ort-wasm-simd-threaded.mjs',
  './vendor/ort-wasm-simd-threaded.wasm'
];
function absolute(relative) { return new URL(relative, BASE_URL).href; }
function insideScope(url) { return url.origin === new URL(BASE_URL).origin && url.href.startsWith(BASE_URL); }
function isAIPath(pathname) { return pathname.includes('/models/trionfo_v14.onnx') || pathname.includes('/vendor/'); }

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    // 41 card images must be cached for offline play, not just the HTML shell.
    await cache.addAll([...new Set([...CORE_FILES, ...CARD_FILES])].map(absolute));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith(CACHE_PREFIX) && n !== APP_CACHE && n !== RUNTIME_CACHE)
      .map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(APP_CACHE)).put(request, response.clone()).catch(() => {});
  return response;
}
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    else {
      const saved = await cache.match(request);
      if (saved) return saved;
    }
    return response;
  } catch (error) {
    const saved = await cache.match(request);
    if (saved) return saved;
    throw error;
  }
}
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!insideScope(url)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await networkFirst(event.request, APP_CACHE);
        if (response.ok) return response;
      } catch (_) { /* offline */ }
      return (await caches.match(absolute('./index.html'))) || Response.error();
    })());
    return;
  }
  event.respondWith(isAIPath(url.pathname)
    ? networkFirst(event.request, RUNTIME_CACHE)
    : cacheFirst(event.request));
});

async function aiFilesPresent() {
  const cache = await caches.open(RUNTIME_CACHE);
  const checks = await Promise.all(OFFLINE_AI.map(name => cache.match(absolute(name))));
  return checks.every(Boolean);
}

self.addEventListener('message', event => {
  const msg = event.data || {};
  const port = event.ports && event.ports[0];
  if (!port) return;
  if (msg.type === 'OFFLINE_STATUS') {
    event.waitUntil(aiFilesPresent().then(ready => port.postMessage({type:'STATUS', ready}))
      .catch(error => port.postMessage({type:'ERROR', error:String(error.message || error)})));
    return;
  }
  if (msg.type !== 'OFFLINE_PREPARE') return;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(RUNTIME_CACHE);
      let done = 0;
      for (const name of OFFLINE_AI) {
        const response = await fetch(absolute(name), {cache:'reload'});
        if (!response.ok || response.type === 'opaque') throw new Error(`${name}: HTTP ${response.status}`);
        await cache.put(absolute(name), response);
        done += 1;
        port.postMessage({type:'PROGRESS', done, total:OFFLINE_AI.length, file:name});
      }
      const ready = await aiFilesPresent();
      port.postMessage({type:'DONE', ready});
    } catch (error) {
      port.postMessage({type:'ERROR', error:String(error.message || error)});
    }
  })());
});

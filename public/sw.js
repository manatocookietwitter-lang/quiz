const CACHE_PREFIX = 'quiz-make-cache-';
const BUILD_ID = new URL(self.location.href).searchParams.get('v') || 'fallback';
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`;
const BASE_URL = new URL(self.registration.scope);
const BASE_PATH = BASE_URL.pathname;
const INDEX_URL = new URL('index.html', BASE_URL).href;
const APP_SHELL = [
  BASE_URL.href,
  INDEX_URL,
  new URL('manifest.webmanifest?v=20260815-5', BASE_URL).href,
  new URL('icons/icon-192.png?v=20260815-5', BASE_URL).href,
  new URL('icons/icon-512.png?v=20260815-5', BASE_URL).href,
  new URL('icons/maskable-512.png?v=20260815-5', BASE_URL).href,
];

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === `${BASE_PATH}sw.js`) return;
  if (url.searchParams.has('_quiz_update_check')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.startsWith(BASE_PATH)) {
    event.respondWith(staleWhileRevalidate(event));
  }
});

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const indexRequest = new Request(INDEX_URL, { cache: 'reload' });
  const indexResponse = await fetch(indexRequest);
  if (!indexResponse.ok) {
    throw new Error(`Unable to precache app shell (${indexResponse.status})`);
  }

  await Promise.all([
    cache.put(INDEX_URL, indexResponse.clone()),
    cache.put(BASE_URL.href, indexResponse.clone()),
  ]);

  const html = await indexResponse.text();
  const assetUrls = extractBuildAssetUrls(html);
  await Promise.all(assetUrls.map((url) => fetchAndCache(cache, url, true)));

  const optionalShellUrls = APP_SHELL.filter((url) => url !== BASE_URL.href && url !== INDEX_URL);
  await Promise.all(optionalShellUrls.map((url) => fetchAndCache(cache, url, false)));
}

function extractBuildAssetUrls(html) {
  const urls = new Set();
  const attributePattern = /(?:src|href)=["']([^"']+)["']/gi;
  let match;

  while ((match = attributePattern.exec(html)) !== null) {
    const url = new URL(match[1], self.location.origin);
    if (url.origin === self.location.origin && url.pathname.startsWith(`${BASE_PATH}assets/`)) {
      urls.add(url.href);
    }
  }

  return [...urls];
}

async function fetchAndCache(cache, url, required) {
  try {
    const response = await fetch(new Request(url, { cache: 'reload' }));
    if (!response.ok) {
      if (required) throw new Error(`Unable to precache ${url} (${response.status})`);
      return;
    }
    await cache.put(url, response);
  } catch (error) {
    if (required) throw error;
  }
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  let networkResponse;

  try {
    networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
      return networkResponse;
    }
    if (networkResponse.status < 500) return networkResponse;
  } catch {
    // Fall through to the cached app shell.
  }

  const cachedResponse = (await cache.match(request))
    || (await cache.match(INDEX_URL))
    || (await cache.match(BASE_URL.href));
  return cachedResponse || networkResponse || Response.error();
}

async function staleWhileRevalidate(event) {
  const { request } = event;
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const networkRequest = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(request, response.clone());
    if (response.status >= 500 && cached) return cached;
    return response;
  });

  if (cached) {
    event.waitUntil(networkRequest.catch(() => undefined));
    return cached;
  }

  try {
    return await networkRequest;
  } catch {
    return Response.error();
  }
}

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const workerSource = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://example.test';
const scope = `${origin}/quiz/`;

function createWorkerHarness(fetchHandler = async () => new Response('ok')) {
  const handlers = new Map();
  const entries = new Map();
  const deletedCaches = [];
  const networkRequests = [];
  let claimed = false;

  const keyOf = (input) => {
    const value = typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
    return new URL(value, origin).href;
  };
  const cache = {
    async match(input) {
      return entries.get(keyOf(input))?.clone();
    },
    async put(input, response) {
      entries.set(keyOf(input), response.clone());
    },
  };
  const context = vm.createContext({
    URL,
    Request,
    Response,
    Set,
    caches: {
      async open() {
        return cache;
      },
      async keys() {
        return ['quiz-make-cache-old', 'quiz-make-cache-build-1', 'another-app-cache'];
      },
      async delete(name) {
        deletedCaches.push(name);
        return true;
      },
    },
    async fetch(input) {
      networkRequests.push(keyOf(input));
      return fetchHandler(input);
    },
    self: {
      location: {
        href: `${scope}sw.js?v=build-1`,
        origin,
      },
      registration: { scope },
      clients: {
        async claim() {
          claimed = true;
        },
      },
      async skipWaiting() {},
      addEventListener(type, handler) {
        handlers.set(type, handler);
      },
    },
  });

  vm.runInContext(
    `${workerSource}\nglobalThis.__workerTest = { networkFirst, staleWhileRevalidate, extractBuildAssetUrls };`,
    context,
  );

  return {
    api: context.__workerTest,
    handlers,
    entries,
    deletedCaches,
    networkRequests,
    get claimed() {
      return claimed;
    },
  };
}

test('activation removes only obsolete Quiz make cache generations', async () => {
  const harness = createWorkerHarness();
  let activation;
  harness.handlers.get('activate')({
    waitUntil(promise) {
      activation = promise;
    },
  });

  await activation;

  assert.deepEqual(harness.deletedCaches, ['quiz-make-cache-old']);
  assert.equal(harness.claimed, true);
});

test('navigation falls back to the cached app shell on an HTTP 5xx response', async () => {
  const harness = createWorkerHarness(async () => new Response('temporary failure', { status: 503 }));
  harness.entries.set(`${scope}index.html`, new Response('cached app shell', { status: 200 }));

  const response = await harness.api.networkFirst(new Request(scope));

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'cached app shell');
});

test('install-time asset discovery includes only this app build assets', () => {
  const harness = createWorkerHarness();
  const urls = harness.api.extractBuildAssetUrls(`
    <link rel="stylesheet" href="/quiz/assets/index-a.css">
    <script type="module" src="/quiz/assets/index-b.js"></script>
    <link rel="icon" href="/quiz/icons/icon-192.png">
    <script src="https://third-party.test/external.js"></script>
  `);

  assert.deepEqual(
    Array.from(urls),
    [
      `${origin}/quiz/assets/index-a.css`,
      `${origin}/quiz/assets/index-b.js`,
    ],
  );
});

test('install precaches the current HTML and its hashed JS/CSS for offline reloads', async () => {
  const indexHtml = `
    <!doctype html>
    <link rel="stylesheet" href="/quiz/assets/index-a.css">
    <script type="module" src="/quiz/assets/index-b.js"></script>
  `;
  const harness = createWorkerHarness(async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.pathname === '/quiz/index.html') return new Response(indexHtml, { status: 200 });
    return new Response(`asset:${url.pathname}`, { status: 200 });
  });
  let installation;
  harness.handlers.get('install')({
    waitUntil(promise) {
      installation = promise;
    },
  });

  await installation;

  assert.equal(await harness.entries.get(scope).text(), indexHtml);
  assert.equal(await harness.entries.get(`${scope}index.html`).text(), indexHtml);
  assert.equal(harness.entries.has(`${scope}assets/index-a.css`), true);
  assert.equal(harness.entries.has(`${scope}assets/index-b.js`), true);
});

test('cached static assets remain available when revalidation returns 5xx', async () => {
  const harness = createWorkerHarness(async () => new Response('temporary failure', { status: 502 }));
  const assetUrl = `${scope}assets/index.js`;
  harness.entries.set(assetUrl, new Response('cached asset', { status: 200 }));
  let revalidation;

  const response = await harness.api.staleWhileRevalidate({
    request: new Request(assetUrl),
    waitUntil(promise) {
      revalidation = promise;
    },
  });
  await revalidation;

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'cached asset');
  assert.deepEqual(harness.networkRequests, [assetUrl]);
});

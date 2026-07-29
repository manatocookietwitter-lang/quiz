declare global {
  interface WindowEventMap {
    'quiz-make-sw-update': CustomEvent<{ worker: ServiceWorker }>;
  }
}

declare const __QUIZ_BUILD_ID__: string;

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const UPDATE_CHECK_DEBOUNCE_MS = 5 * 1000;

let refreshing = false;
let lastUpdateCheckAt = 0;
const notifiedWorkers = new WeakSet<ServiceWorker>();
const observedWorkers = new WeakSet<ServiceWorker>();
const observedRegistrations = new WeakSet<ServiceWorkerRegistration>();

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const wasControlledAtStartup = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.addEventListener('controllerchange', async () => {
    if (!wasControlledAtStartup || refreshing) return;
    refreshing = true;
    await Promise.all([
      waitForPendingAppDataSaves(),
      waitForPendingCategoryNoteSaves(),
    ]);
    window.location.reload();
  });

  const start = () => {
    const baseUrl = import.meta.env.BASE_URL || '/';
    void registerVersion(baseUrl, __QUIZ_BUILD_ID__)
      .then((registration) => {
        observeRegistration(registration);
        setupUpdateChecks(registration, baseUrl);
      })
      .catch((error) => {
        console.warn('Service Worker registration failed:', error);
      });
  };

  if (document.readyState === 'complete') {
    start();
  } else {
    window.addEventListener('load', start, { once: true });
  }
}

function notifyUpdate(worker: ServiceWorker) {
  if (notifiedWorkers.has(worker)) return;
  notifiedWorkers.add(worker);
  window.dispatchEvent(new CustomEvent('quiz-make-sw-update', { detail: { worker } }));
}

function registerVersion(baseUrl: string, buildId: string) {
  const scriptUrl = new URL(`${baseUrl}sw.js`, window.location.origin);
  scriptUrl.searchParams.set('v', buildId);
  return navigator.serviceWorker.register(scriptUrl, {
    scope: baseUrl,
    updateViaCache: 'none',
  });
}

function observeRegistration(registration: ServiceWorkerRegistration) {
  if (registration.waiting) {
    notifyUpdate(registration.waiting);
  }
  if (registration.installing) {
    observeInstallingWorker(registration.installing);
  }
  if (observedRegistrations.has(registration)) return;

  observedRegistrations.add(registration);
  registration.addEventListener('updatefound', () => {
    const installingWorker = registration.installing;
    if (!installingWorker) return;
    observeInstallingWorker(installingWorker);
  });
}

function observeInstallingWorker(worker: ServiceWorker) {
  if (observedWorkers.has(worker)) return;
  observedWorkers.add(worker);

  const handleStateChange = () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      notifyUpdate(worker);
    }
  };
  worker.addEventListener('statechange', handleStateChange);
  handleStateChange();
}

function setupUpdateChecks(registration: ServiceWorkerRegistration, baseUrl: string) {
  const check = (force = false) => {
    const now = Date.now();
    if (!force && now - lastUpdateCheckAt < UPDATE_CHECK_DEBOUNCE_MS) return;
    lastUpdateCheckAt = now;
    void checkForUpdate(registration, baseUrl);
  };

  check(true);

  window.setInterval(() => check(true), UPDATE_CHECK_INTERVAL_MS);
  window.addEventListener('online', () => check(true));
  window.addEventListener('focus', () => check());
  window.addEventListener('pageshow', () => check());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}

async function checkForUpdate(registration: ServiceWorkerRegistration, baseUrl: string) {
  try {
    const indexUrl = new URL(baseUrl, window.location.origin);
    indexUrl.searchParams.set('_quiz_update_check', Date.now().toString(36));
    const response = await fetch(indexUrl, {
      cache: 'no-store',
      headers: { Accept: 'text/html' },
    });

    if (response.ok) {
      const html = await response.text();
      const remoteBuildId = readBuildId(html);
      if (remoteBuildId && isNewerBuild(remoteBuildId, __QUIZ_BUILD_ID__)) {
        const nextRegistration = await registerVersion(baseUrl, remoteBuildId);
        observeRegistration(nextRegistration);
        if (nextRegistration.waiting) notifyUpdate(nextRegistration.waiting);
        return;
      }
    }

    await registration.update();
    if (registration.waiting) notifyUpdate(registration.waiting);
  } catch (error) {
    // Offline and captive-portal failures are expected; the current worker remains usable.
    console.debug('Service Worker update check skipped:', error);
  }
}

function readBuildId(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return parsed.querySelector<HTMLMetaElement>('meta[name="quiz-build-id"]')?.content.trim() || null;
}

function isNewerBuild(candidate: string, current: string) {
  const candidateTimestamp = Number.parseInt(candidate.split('-', 1)[0], 36);
  const currentTimestamp = Number.parseInt(current.split('-', 1)[0], 36);
  return Number.isFinite(candidateTimestamp)
    && Number.isFinite(currentTimestamp)
    && candidateTimestamp > currentTimestamp;
}
import { waitForPendingAppDataSaves } from './storage';
import { waitForPendingCategoryNoteSaves } from './utils/noteStorage';

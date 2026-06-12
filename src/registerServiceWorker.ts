declare global {
  interface WindowEventMap {
    'quiz-make-sw-update': CustomEvent<{ worker: ServiceWorker }>;
  }
}

let refreshing = false;

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    const baseUrl = import.meta.env.BASE_URL || '/';
    navigator.serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl }).then((registration) => {
      if (registration.waiting) {
        notifyUpdate(registration.waiting);
      }

      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;

        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            notifyUpdate(installingWorker);
          }
        });
      });
    }).catch((error) => {
      console.warn('Service Worker registration failed:', error);
    });
  });
}

function notifyUpdate(worker: ServiceWorker) {
  window.dispatchEvent(new CustomEvent('quiz-make-sw-update', { detail: { worker } }));
}

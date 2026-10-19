/** Registers the app-shell service worker, in production only (it would fight hot reload in development). */
export function registerServiceWorker(): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Not installable here (e.g. no https): the site works the same without it.
    });
  });
}

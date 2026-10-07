// Minimal service worker so phones treat JazzUp as an installable app.
// It does not cache anything — the app always loads fresh data.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})

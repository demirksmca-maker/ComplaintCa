// Minimal service worker — required for PWA installability (Chrome/TWA).
// Intentionally does NOT cache anything: the app is highly dynamic
// (Firestore data, AI calls, forms), so a network-passthrough worker is
// the safest choice — no stale content risk.
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function(e){ e.respondWith(fetch(e.request)); });

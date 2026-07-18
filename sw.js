// Minimal service worker — required for PWA installability (Chrome/TWA).
// Intentionally does NOT cache anything: the app is highly dynamic
// (Firestore data, AI calls, forms), so a network-passthrough worker is
// the safest choice — no stale content risk.
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
// Only ever touch SAME-ORIGIN requests. Intercepting cross-origin requests and
// re-issuing them via fetch() can break cross-origin script loads such as
// Google Identity Services (accounts.google.com/gsi/client) and Google/Firebase
// auth endpoints — leaving those to load natively is both safer and correct.
self.addEventListener('fetch', function(e){
  try{
    if(new URL(e.request.url).origin === self.location.origin){
      e.respondWith(fetch(e.request));
    }
  }catch(_){ /* let the browser handle it natively */ }
});

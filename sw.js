const CACHE = 'tonight-v8';
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Pass through — let the browser handle these directly (not subject to connect-src):
  // • Firebase / Cloud Functions / Auth endpoints
  // • Firebase JS modules (www.gstatic.com)
  // • CDN scripts (cdn.jsdelivr.net)
  // • Non-font googleapis.com (Firebase Firestore/Auth APIs)
  // • Storage bucket
  if (
    url.hostname.includes('cloudfunctions.net') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebasestorage.googleapis.com') ||
    (url.hostname.includes('googleapis.com') && !url.hostname.startsWith('fonts.')) ||
    (url.hostname.includes('gstatic.com') && !url.hostname.startsWith('fonts.')) ||
    url.hostname === 'cdn.jsdelivr.net' ||
    url.pathname.startsWith('/portal')
  ) return;

  // Stale-while-revalidate for Unsplash images
  if (url.hostname === 'images.unsplash.com') {
    e.respondWith(
      caches.open(CACHE).then(c =>
        c.match(e.request).then(cached => {
          const fresh = fetch(e.request).then(res => {
            if (res.ok) c.put(e.request, res.clone());
            return res;
          }).catch(() => null);
          return cached || fresh;
        })
      )
    );
    return;
  }

  // Network-first for HTML pages — always serve fresh content
  if (
    url.hostname === self.location.hostname &&
    (url.pathname === '/' || url.pathname.endsWith('.html'))
  ) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request).then(c => c || caches.match('/browse.html')))
    );
    return;
  }

  // Cache-first for fonts and local static assets
  if (
    url.hostname === self.location.hostname ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'fonts.googleapis.com'
  ) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        }).catch(() => caches.match('/browse.html'));
      })
    );
    return;
  }

  // Anything else — pass through without caching
  // (avoids connect-src violations for unknown third-party origins)
});

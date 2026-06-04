const CACHE = 'tonight-v7';
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500&family=Bebas+Neue&display=swap'
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

  // Never intercept portal or function requests — always go to network
  if (
    url.pathname.startsWith('/portal') ||
    url.hostname.includes('cloudfunctions.net') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') && !url.hostname.includes('fonts')
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

  // Cache-first for static assets (icons, fonts)
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

  // Network-first for everything else
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

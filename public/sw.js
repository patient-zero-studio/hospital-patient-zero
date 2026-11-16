/*
 * Hospital — Patient Zero : service worker.
 * Makes the game installable and lets solo play start without a connection
 * once it has been opened online. Accounts, coins, leaderboard and multiplayer
 * (/api, /ws) always need the network and are never cached.
 */
const CACHE = 'pz-v3';
const CORE = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws')) return;

  // The page itself: network first (new versions show up at once). If the
  // server is asleep and slow to answer, show the saved page after 4 s: the
  // game then displays its own "waking up" screen instead of a blank page.
  if (req.mode === 'navigate') {
    const net = fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('/', copy));
      }
      return res;
    });
    const slow = new Promise((ok) => setTimeout(ok, 4000)).then(() => caches.match('/'));
    e.respondWith(
      Promise.race([net.catch(() => caches.match('/')), slow.then((hit) => hit || net)]).then((r) => r || net)
    );
    return;
  }

  // Built files have a hash in their name: cache first, then keep a copy
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/audio/') || url.pathname.startsWith('/icons/'))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});

// 🔔 Push notifications: friend invites, gifts, events… (even with the game closed)
self.addEventListener('push', (e) => {
  let d = { title: 'Patient Zero', body: '', tag: 'pz' };
  try {
    d = { ...d, ...e.data.json() };
  } catch {
    /* plain text */
  }
  e.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      tag: d.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: '/' },
    })
  );
});

// Click: back to the game (an open window if there is one)
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const win = list.find((c) => new URL(c.url).origin === self.location.origin);
      return win ? win.focus() : self.clients.openWindow('/');
    })
  );
});

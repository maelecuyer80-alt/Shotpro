// Hors ligne : l'appli fonctionne au gymnase même sans réseau.
const CACHE = 'shotpro-live-v2.0.0';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/tracker.js', 'js/program.js', 'js/store.js', 'js/audio.js', 'js/camera.js', 'js/machine.js', 'js/dribble.js', 'js/clips.js', 'js/badges.js',
  'manifest.webmanifest', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // envois vers le Google Sheet : jamais en cache
  const url = new URL(req.url);
  if (url.hostname.includes('script.google')) return;
  if (url.origin === location.origin) {
    // réseau d'abord (pour recevoir les mises à jour), cache si hors ligne
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return r; }).catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
  } else if (url.hostname.includes('fonts.g')) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })));
  }
});

/* Optional installable/offline support for GitHub Pages and other HTTPS hosts. */
const CACHE_NAME = 'signal-dominion-web-v1';
const RESOURCES = [
  './', './index.html', './styles.css', './game.js', './levels.js', './manifest.webmanifest',
  './assets/img/icon.png',
  './assets/audio/button.wav', './assets/audio/complete.wav', './assets/audio/hint.wav',
  './assets/audio/reset.wav', './assets/audio/optimal.wav',
  './assets/audio/signal_up.wav', './assets/audio/signal_down.wav',
  './assets/audio/ambient_loop.wav',
  './assets/audio/neon_after_midnight.mp3', './assets/audio/sunlit_dunes.mp3'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(RESOURCES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(n => n.startsWith('signal-dominion-web-') && n !== CACHE_NAME).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache => cache.put(event.request,copy));}
    return response;
  })));
});

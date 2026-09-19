/*
 * Service worker: makes the app installable and usable offline.
 *
 * Strategy: network first for everything on this site (so updates arrive as
 * soon as they are published), falling back to the cache when offline.
 * Requests to other origins (the database, fonts) are never cached here.
 * Bump VERSION when the precache list changes.
 */
var VERSION = 'cilly-log-20260919-1110';
var PRECACHE = [
  './',
  './index.html',
  './css/app.css',
  './js/config.js',
  './js/store.js',
  './js/changelog.js',
  './js/sleep-model.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(VERSION)
      .then(function(cache){ return cache.addAll(PRECACHE); })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys()
      .then(function(keys){
        return Promise.all(keys.filter(function(k){ return k !== VERSION; }).map(function(k){ return caches.delete(k); }));
      })
      .then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Always revalidate the page itself: it carries the version stamps that
  // point at the current CSS and JS, so a stale copy would load stale scripts.
  var request = req.mode === 'navigate' ? new Request(req, { cache: 'no-cache' }) : req;

  event.respondWith(
    fetch(request)
      .then(function(res){
        if (res && res.ok){
          var copy = res.clone();
          caches.open(VERSION).then(function(cache){ cache.put(req, copy); });
        }
        return res;
      })
      .catch(function(){
        // ignoreSearch so a versioned asset still matches its cached copy.
        return caches.match(req, { ignoreSearch: true }).then(function(cached){
          if (cached) return cached;
          if (req.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
      })
  );
});

/* Life Essential Skills service worker: offline-first shell, fresh content.
 *
 * Strategy:
 * - On install, precache the app shell (HTML, CSS, JS, manifest, icons and
 *   the generated learner core) so the dashboard opens with no connectivity.
 * - At runtime, same-origin GET requests are served cache-first and the
 *   network copy refreshes the cache, so guides, chunks and per-item
 *   feedback keep working offline after the first visit.
 * - Navigations that miss both cache and network fall back to the learner
 *   dashboard instead of the browser's offline error page.
 * - The aggregate reference files (assessor/answers.json,
 *   assessor/benchmarks.json) are NEVER cached or served by this worker:
 *   they are excluded from the deploy, and the deny-list below keeps them
 *   out of the cache even if a maintainer build serves them locally.
 * - Bumping CACHE below retires the previous cache on activate.
 */
'use strict';

const CACHE = 'les-v1';

const PRECACHE = [
  '/',
  '/index.html',
  '/learner/',
  '/learner/index.html',
  '/manifest.webmanifest',
  '/learner/style.css',
  '/learner/product.css',
  '/learner/data.js',
  '/learner/evidence.js',
  '/learner/engine.js',
  '/learner/roadmap.js',
  '/learner/ai-boundary.js',
  '/learner/catalog.js',
  '/learner/ui.js',
  '/learner/roadmap-view.js',
  '/learner/onboarding-view.js',
  '/learner/simulation-view.js',
  '/learner/feedback-view.js',
  '/learner/profile-view.js',
  '/learner/assessor.js',
  '/learner/app.js',
  '/learner/favicon.svg',
  '/learner/icon-192.png',
  '/learner/icon-512.png',
  '/START-HERE.md'
];

// Aggregate solution files must never enter the cache. They are excluded
// from hosting uploads, and this list keeps a local preview honest too.
const NEVER_CACHE = ['assessor/answers.json', 'assessor/benchmarks.json'];

const neverCache = (url) => NEVER_CACHE.some((name) => url.pathname.endsWith('/' + name));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || neverCache(url)) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: false }).then((hit) => {
      const network = fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => undefined);
      if (hit) return hit;
      return network.then((response) => {
        if (response) return response;
        if (request.mode === 'navigate') return caches.match('/learner/index.html');
        throw new Error('offline and not cached');
      });
    })
  );
});

// Exercise the service worker's real event logic with stubbed browser APIs:
// precache contents exist on disk, old caches retire, navigation falls back
// offline, aggregate answers are never intercepted, non-GET passes through.
// Uses only Node built-ins (no npm install needed).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let fail = 0;
const check = (name, cond) => {
  if (!cond) fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
};

// ---- Minimal browser stubs -------------------------------------------------
const store = new Map(); // cacheName -> Map(url -> body)
const listeners = {};
const stubCaches = {
  open: async (name) => {
    if (!store.has(name)) store.set(name, new Map());
    const map = store.get(name);
    return {
      addAll: async (urls) => {
        for (const u of urls) {
          let pathname = decodeURIComponent(new URL(u, 'http://localhost').pathname);
          if (pathname === '/') pathname = '/index.html';
          if (pathname.endsWith('/')) pathname += 'index.html';
          const file = path.join(ROOT, pathname);
          if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            throw new Error('precache missing on disk: ' + u);
          }
          map.set(u, fs.readFileSync(file));
        }
      },
      put: async (req, body) => { map.set(typeof req === 'string' ? req : req.url, body); },
      match: async (req) => {
        const key = typeof req === 'string' ? req : req.url;
        const hit = map.get(key);
        if (hit === undefined) return undefined;
        return { ok: true, clone: () => hit, _body: hit };
      },
    };
  },
  keys: async () => [...store.keys()],
  delete: async (name) => store.delete(name),
  match: async (req) => {
    for (const map of store.values()) {
      const hit = map.get(typeof req === 'string' ? req : req.url);
      if (hit !== undefined) return { ok: true, clone: () => hit, _body: hit };
    }
    return undefined;
  },
};

let online = true;
const stubFetch = async (request) => {
  const url = typeof request === 'string' ? request : request.url;
  if (!online) throw new Error('offline');
  const file = path.join(ROOT, decodeURIComponent(new URL(url, 'http://localhost').pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) return { ok: false };
  return { ok: true, clone: () => ({ url }), _url: url };
};

const sandbox = {
  self: {
    location: { origin: 'http://localhost' },
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  },
  caches: stubCaches,
  fetch: stubFetch,
  URL,
};
sandbox.self.registration = undefined;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), sandbox);

const fire = (type, event) => {
  let promise = Promise.resolve();
  const waitUntil = (p) => { promise = Promise.resolve(p); };
  const respondWith = (p) => { promise = Promise.resolve(p); event._response = promise; };
  for (const fn of listeners[type] || []) fn({ ...event, waitUntil, respondWith });
  return promise.then(() => event);
};

(async () => {
  check('sw registers install, activate and fetch handlers',
    (listeners.install || []).length === 1 && (listeners.activate || []).length === 1 && (listeners.fetch || []).length === 1);

  // Install precaches every listed shell file from disk.
  await fire('install', {});
  const cacheNames = await stubCaches.keys();
  check('install creates exactly one versioned cache', cacheNames.length === 1 && /^les-/.test(cacheNames[0]));
  const cached = [...(store.get(cacheNames[0]) || new Map()).keys()];
  check('precache covers the dashboard shell and learner core',
    ['/learner/index.html', '/learner/app.js', '/learner/data.js', '/manifest.webmanifest'].every((u) => cached.includes(u)));
  check('precache never includes an aggregate answer file',
    cached.every((u) => !u.includes('assessor/answers.json') && !u.includes('assessor/benchmarks.json')));

  // Activate retires older caches.
  store.set('les-old', new Map([['/x', Buffer.from('x')]]));
  await fire('activate', {});
  check('activate deletes retired caches and keeps the current one',
    !(await stubCaches.keys()).includes('les-old') && (await stubCaches.keys()).length === 1);

  // Runtime: cached page served while offline refresh is skipped; navigation
  // falls back to the dashboard when both cache and network miss.
  online = false;
  const navMiss = await fire('fetch', { request: { method: 'GET', url: 'http://localhost/pathways', mode: 'navigate' } });
  const navBody = await navMiss._response.then((r) => (r && r._body ? r._body.toString() : ''));
  check('offline navigation falls back to the learner dashboard', navBody.includes('Life Essential Skills'));

  // Aggregate answers and non-GET requests are never intercepted.
  const answers = await fire('fetch', { request: { method: 'GET', url: 'http://localhost/assessor/answers.json', mode: 'no-cors' } });
  check('aggregate answers.json passes through untouched', answers._response === undefined);
  const post = await fire('fetch', { request: { method: 'POST', url: 'http://localhost/learner/', mode: 'cors' } });
  check('non-GET requests pass through untouched', post._response === undefined);

  // Manifest icons exist on disk at their declared sizes.
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  check('manifest icons resolve to real files',
    manifest.icons.every((i) => fs.existsSync(path.join(ROOT, decodeURIComponent(new URL(i.src, 'http://localhost').pathname)))));

  console.log(fail === 0 ? '\nALL PWA CHECKS PASS' : `\n${fail} FAILURE(S)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.log('FAIL harness error: ' + e.message); process.exit(1); });

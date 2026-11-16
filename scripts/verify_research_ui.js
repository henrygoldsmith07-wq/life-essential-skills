// Execute the real Discover page code against the committed digest in a small
// DOM stub. Source-text checks cannot catch a render that throws or a view
// that silently shows nothing; this exercises the actual journey. No packages.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
let fail = 0;
const ok = (name, cond, extra) => {
  if (!cond) fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`);
};

class StubNode {}
class TextNode extends StubNode {
  constructor(t) { super(); this._text = String(t); }
  get textContent() { return this._text; }
}
class El extends StubNode {
  constructor(tag) {
    super();
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this.dataset = {};
    this._text = '';
    this.hidden = false;
    this.value = '';
    this.disabled = false;
    this.open = false;
    this.options = [];
    const self = this;
    this.classList = {
      add: (...c) => c.forEach((x) => self._classes.add(x)),
      remove: (...c) => c.forEach((x) => self._classes.delete(x)),
      toggle: (c, on) => { const v = on === undefined ? !self._classes.has(c) : !!on; v ? self._classes.add(c) : self._classes.delete(c); return v; },
      contains: (c) => self._classes.has(c),
    };
    this._classes = new Set();
  }
  get className() { return [...this._classes].join(' '); }
  set className(v) { this._classes = new Set(String(v || '').split(/\s+/).filter(Boolean)); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = []; this._text = String(v == null ? '' : v); }
  append(...items) { for (const it of items) this.children.push(it instanceof StubNode ? it : new TextNode(it)); }
  appendChild(it) { this.append(it); return it; }
  replaceChildren(...items) { this.children = []; this.append(...items); }
  get lastElementChild() { for (let i = this.children.length - 1; i >= 0; i--) if (this.children[i] instanceof El) return this.children[i]; return null; }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v);
  }
  getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  fire(t, ev = {}) { (this.listeners[t] || []).forEach((fn) => fn({ target: this, ...ev })); }
  contains(n) { return this === n || this.children.some((c) => c instanceof El && c.contains(n)); }
  querySelector(sel) { return sel === 'summary' ? (this.children.find((c) => c instanceof El && c.tagName === 'SUMMARY') || null) : null; }
  querySelectorAll(sel) { return sel === 'dd' ? this.descendants().filter((c) => c.tagName === 'DD') : []; }
  descendants() { return this.children.flatMap((c) => c instanceof El ? [c, ...c.descendants()] : []); }
  focus() {}
}
const byId = {};
const el = (id, tag = 'div') => (byId[id] = new El(tag));
for (const id of ['results', 'meta', 'picks', 'picks-list', 'topics', 'count', 'more', 'f-confidence', 'f-day', 'f-source', 'f-search', 'toast', 'stats', 'source-list', 'reset', 'more-filters']) el(id);
byId['f-confidence'].options = [new El('option')];
byId['f-day'].options = [new El('option')];
byId['f-source'].options = [new El('option')];
for (let i = 0; i < 3; i++) byId['stats'].append(new El('dd'));
byId['more-filters'].append(new El('summary'));
const tabs = ['skills', 'facts', 'headlines', 'quiz', 'saved', 'papers'].map((view) => {
  const b = new El('button');
  b.dataset.view = view;
  return b;
});
const counts = ['skills', 'facts', 'headlines', 'quiz', 'saved'].map((name) => {
  const s = new El('span');
  s.dataset.count = name;
  return s;
});
const docListeners = {};
const document = {
  getElementById: (id) => byId[id] || null,
  createElement: (tag) => new El(tag),
  querySelectorAll: (sel) => sel === '.tabs button' ? tabs : sel === '[data-count]' ? counts : [],
  addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); },
  activeElement: { tagName: 'BODY' },
};

const FEED = read('research/data/feed.json');
const PAPERS = read('research/data/papers.json');
const ARCHIVE = read('research/data/archive/index.json');
let lastHash = '';
const storage = new Map();
const sandbox = {
  document,
  Node: StubNode,
  URL,
  URLSearchParams,
  Date,
  console,
  setTimeout,
  clearTimeout,
  location: { hash: '', pathname: '/research/', search: '', protocol: 'http:' },
  history: { replaceState: (_a, _b, url) => { lastHash = String(url); } },
  navigator: { clipboard: { writeText: async () => {} } },
  localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
  fetch: async (url) => {
    let data;
    if (url === 'data/feed.json') data = FEED;
    else if (url === 'data/papers.json') data = PAPERS;
    else if (url === 'data/archive/index.json') data = ARCHIVE;
    else if (url.startsWith('data/archive/')) data = read(`research/data/${url.slice(5)}`);
    else throw new Error('unexpected fetch: ' + url);
    return { ok: true, status: 200, json: async () => data };
  },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'research/research.js'), 'utf8'), sandbox, { filename: 'research.js' });
const flush = async (ms = 25) => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); await new Promise((r) => setTimeout(r, ms)); };
const cardCount = () => byId.results.descendants().filter((c) => c.classList.contains('card')).length;
const textOf = (id) => byId[id].textContent;

(async () => {
  (docListeners.DOMContentLoaded || []).forEach((fn) => fn());
  await flush();
  ok('init renders run statistics', /Updated/.test(textOf('meta')), textOf('meta').slice(0, 70));
  ok('init renders cards from the real feed', cardCount() > 0, cardCount() + ' cards');
  ok('today’s picks render', byId.picks.hidden === false && byId['picks-list'].children.length >= 2);
  ok('source health renders', byId['source-list'].descendants().some((c) => c.tagName === 'LI'));

  tabs.find((t) => t.dataset.view === 'facts').fire('click');
  await flush();
  ok('facts view renders', cardCount() > 0 && /Did you know\?/.test(textOf('results')));
  tabs.find((t) => t.dataset.view === 'papers').fire('click');
  await flush();
  ok('all-papers view renders rows', byId.results.children.some((c) => c.classList.contains('paper') || c.tagName === 'DIV'));
  tabs.find((t) => t.dataset.view === 'skills').fire('click');
  await flush();
  const renderedButtons = byId.results.descendants().filter((c) => c.tagName === 'BUTTON');
  ok('every rendered button has an accessible name', renderedButtons.length > 0 && renderedButtons.every((b) => (b.getAttribute('aria-label') || '').trim() || b.textContent.trim()), renderedButtons.length + ' buttons');
  const newTabLinks = byId.results.descendants().filter((c) => c.tagName === 'A' && c.getAttribute('target') === '_blank');
  ok('new-tab links are noopener', newTabLinks.length > 0 && newTabLinks.every((a) => /noopener/.test(a.getAttribute('rel') || '')), newTabLinks.length + ' links');

  const save = byId.results.descendants().find((c) => c.tagName === 'BUTTON' && /Save/.test(c.textContent));
  if (save) save.fire('click');
  ok('save writes only to browser storage', storage.has('les-research-saved'), [...storage.keys()].join(','));
  tabs.find((t) => t.dataset.view === 'saved').fire('click');
  await flush();
  ok('saved view shows the kept card', cardCount() === 1 && /Nothing saved/.test(textOf('results')) === false);

  tabs.find((t) => t.dataset.view === 'quiz').fire('click');
  await flush();
  const buttons = () => byId.results.descendants().filter((c) => c.tagName === 'BUTTON');
  ok('quiz starts with a question', /Question 1 of/.test(textOf('results')));
  if (buttons().some((b) => /Show answer/.test(b.textContent))) {
    buttons().find((b) => /Show answer/.test(b.textContent)).fire('click');
    await flush(0);
    ok('quiz reveals the answer', /I knew it/.test(textOf('results')));
    buttons().find((b) => /I knew it/.test(b.textContent)).fire('click');
    await flush(0);
    ok('quiz advances', /Question 2 of/.test(textOf('results')));
  } else ok('quiz reveals the answer', false, 'no Show answer button');

  tabs.find((t) => t.dataset.view === 'skills').fire('click');
  await flush();
  byId['f-search'].value = 'sleep';
  byId['f-search'].fire('input');
  await flush(220);
  ok('search is shareable in the URL hash', lastHash.includes('q=sleep'), lastHash);

  // Untrusted feed text must stay text, and unsafe links must not render.
  const hostile = JSON.parse(JSON.stringify(FEED));
  hostile.items = hostile.items.slice(0, 2);
  hostile.items[0].ai.headline = '<img src=x onerror=alert(1)>';
  hostile.items[0].url = 'javascript:alert(1)';
  const hostileSandbox = { ...sandbox, document: { ...document, getElementById: (id) => byId[id] || null } };
  hostileSandbox.fetch = async (url) => ({ ok: true, status: 200, json: async () => url === 'data/feed.json' ? hostile : url === 'data/papers.json' ? PAPERS : ARCHIVE });
  vm.createContext(hostileSandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'research/research.js'), 'utf8'), hostileSandbox, { filename: 'research.js' });
  // The new IIFE registered its own listener on the shared document; fire it.
  (docListeners.DOMContentLoaded || []).slice(-1).forEach((fn) => fn());
  await flush();
  ok('hostile feed text is not parsed as HTML', byId.results.descendants().every((c) => c.tagName !== 'IMG'));
  ok('javascript: links are not rendered', byId.results.descendants().every((c) => c.getAttribute('href') !== 'javascript:alert(1)'));

  console.log(fail ? `FAIL ${fail} Discover UI contract(s)` : 'PASS Discover UI executes against real data');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAIL harness error: ' + (e && e.stack || e)); process.exit(1); });

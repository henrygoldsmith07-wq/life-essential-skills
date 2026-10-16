/* Discover page: renders the daily research digest from research/data/*.json.
 * All feed and model text is untrusted, so the DOM is built with textContent
 * and only http(s) links are rendered. Saved items live only in this
 * browser's localStorage; nothing is sent anywhere. */
(function () {
  'use strict';

  const TOPICS = {
    health: 'Health', mind: 'Mind & wellbeing', learning: 'Learning', thinking: 'Thinking', money: 'Money',
    work: 'Work', relationships: 'Relationships', digital: 'Digital life', safety: 'Safety', environment: 'Environment', world: 'The world',
  };
  const LEVEL = { high: 3, moderate: 2, low: 1 };
  const PAGE = { cards: 24, papers: 100 };
  const SAVED_KEY = 'les-research-saved';
  const VIEWS = ['skills', 'facts', 'headlines', 'saved', 'papers'];
  const state = { view: 'skills', topic: '', feed: null, papers: null, archive: {}, dayItems: null, shown: 0, saved: loadSaved() };
  const $ = (id) => document.getElementById(id);

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(3)) if (c != null && c !== '' && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }

  const safeHref = (u) => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch { return null; } };
  const link = (href, text) => { const s = safeHref(href); return s ? h('a', { href: s, rel: 'noopener noreferrer', target: '_blank' }, text) : null; };
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
  const isoToday = () => new Date().toISOString().slice(0, 10);
  const fmtDate = (d) => { if (!d) return ''; const t = new Date(`${d}T12:00:00Z`); return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };
  function dayLabel(d) {
    if (!d) return 'Earlier';
    const diff = Math.round((Date.parse(`${isoToday()}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    const t = new Date(`${d}T12:00:00Z`);
    return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  }

  async function getJson(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return res.json();
  }

  // ---- Saved items (per-browser convenience) -------------------------------------

  function loadSaved() {
    try {
      const v = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
      return Array.isArray(v) ? v.filter((i) => i && i.id && i.ai) : [];
    } catch { return []; }
  }
  function persistSaved() {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(state.saved.slice(0, 300))); } catch { /* private mode: keep in memory */ }
  }
  const isSaved = (id) => state.saved.some((s) => s.id === id);
  function toggleSave(item, btn) {
    if (isSaved(item.id)) state.saved = state.saved.filter((s) => s.id !== item.id);
    else state.saved.unshift(item);
    persistSaved();
    const on = isSaved(item.id);
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? '★ Saved' : '☆ Save';
    toast(on ? 'Saved in this browser' : 'Removed from saved');
    updateCounts();
    if (state.view === 'saved' && !on) render(true);
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  async function share(item) {
    const text = item.ai.life_skill || item.ai.fact || item.ai.headline;
    const url = safeHref(item.url);
    try {
      if (navigator.share) await navigator.share({ title: item.ai.headline, text, url });
      else { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Copied to clipboard'); }
    } catch { /* user cancelled */ }
  }

  // ---- Filtering ---------------------------------------------------------------------

  const baseItems = () => (state.view === 'saved' ? state.saved : state.dayItems || (state.feed && state.feed.items) || []).filter((i) => i && i.ai);
  const viewMatch = (i, view) => (view === 'skills' ? !!i.ai.life_skill : view === 'facts' ? !!i.ai.fact : true);

  function filters() {
    return { conf: $('f-confidence').value, src: $('f-source').value, q: $('f-search').value.trim().toLowerCase() };
  }

  function matches(i, f, ignoreTopic) {
    if (!ignoreTopic && state.topic && i.category !== state.topic) return false;
    if (f.src && i.source_name !== f.src) return false;
    if (f.conf === 'high' && i.ai.confidence !== 'high') return false;
    if (f.conf === 'moderate' && i.ai.confidence === 'low') return false;
    if (f.conf === 'reviewed' && i.kind === 'preprint') return false;
    if (f.q && !`${i.title} ${i.ai.headline} ${i.ai.summary} ${i.ai.life_skill} ${i.ai.fact} ${(i.ai.key_terms || []).join(' ')} ${i.source_name}`.toLowerCase().includes(f.q)) return false;
    return true;
  }

  const items = () => { const f = filters(); return baseItems().filter((i) => viewMatch(i, state.view) && matches(i, f)); };

  function papers() {
    const all = (state.papers && state.papers.items) || [];
    const { src, q } = filters();
    return all.filter((p) => (!src || p.source_name === src) && (!q || `${p.title} ${p.source_name}`.toLowerCase().includes(q)));
  }

  // ---- Pieces ---------------------------------------------------------------------------

  function meter(conf) {
    const level = LEVEL[conf] || 1;
    return h('span', { class: 'meter', title: 'How much weight the evidence can bear' },
      h('span', { class: 'bars', 'data-level': String(level), 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      `${cap(conf || 'low')} confidence`);
  }

  function sourceLinks(i) {
    const links = [link(i.url, `${i.source_name} ↗`)];
    if (i.links && i.links.alphaxiv) links.push(link(i.links.alphaxiv, 'alphaXiv'));
    if (i.links && i.links.pubmed && i.links.pubmed !== i.url) links.push(link(i.links.pubmed, 'PubMed'));
    for (const a of (i.also_in || []).slice(0, 2)) links.push(link(a.url, `also ${a.source_name}`));
    return h('div', { class: 'links' }, links.filter(Boolean));
  }

  function actions(i) {
    const saved = isSaved(i.id);
    const save = h('button', { type: 'button', class: 'icon-btn', 'aria-pressed': String(saved), 'aria-label': `Save: ${i.ai.headline}` }, saved ? '★ Saved' : '☆ Save');
    save.addEventListener('click', () => toggleSave(i, save));
    return h('div', { class: 'actions' }, save,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Share: ${i.ai.headline}`, onclick: () => share(i) }, 'Share'));
  }

  function details(i) {
    const ai = i.ai;
    return h('details', null, h('summary', null, 'What the study found'),
      h('div', null,
        ai.summary ? h('p', null, ai.summary) : null,
        ai.why_it_matters ? h('p', null, h('strong', null, 'Why it matters: '), ai.why_it_matters) : null,
        ai.caveat ? h('p', { class: 'caveat' }, h('strong', null, 'Caveat: '), ai.caveat) : null,
        (ai.key_terms || []).length ? h('div', { class: 'terms', 'aria-label': 'Terms to look up' }, ai.key_terms.map((t) => h('span', null, t))) : null,
        h('p', { class: 'small' }, `${cap(ai.evidence || '')} · `, i.title)));
  }

  function quiz(i) {
    const q = i.ai.quiz;
    if (!q || !q.question || !q.answer) return null;
    return h('details', { class: 'quiz' }, h('summary', null, h('span', { class: 'label' }, 'Check yourself '), q.question), h('div', null, h('p', null, q.answer)));
  }

  function card(i, view) {
    const ai = i.ai;
    const lead = view === 'skills' ? ai.life_skill : view === 'facts' ? ai.fact : ai.headline;
    const kicker = view === 'skills' ? 'Try this' : view === 'facts' ? 'Did you know?' : null;
    return h('article', { class: `card${view === 'facts' ? ' fact' : ''}`, 'data-cat': i.category },
      h('div', { class: 'card-top' },
        h('span', { class: 'tag' }, h('span', { class: 'dot', 'aria-hidden': 'true' }), TOPICS[i.category] || cap(i.category)),
        h('span', { class: 'tag' }, i.kind === 'preprint' ? h('span', { class: 'flag', title: 'Not yet peer reviewed' }, 'Preprint') : null, meter(ai.confidence))),
      kicker ? h('span', { class: 'label' }, kicker) : null,
      h('h3', { class: view === 'facts' ? 'lead-fact' : null }, lead),
      view !== 'headlines' ? h('p', { class: 'sub' }, ai.headline) : h('p', { class: 'sub' }, ai.why_it_matters || ai.summary),
      details(i),
      quiz(i),
      h('div', { class: 'card-foot' }, sourceLinks(i), actions(i)));
  }

  function pick(i) {
    const ai = i.ai;
    return h('article', { class: 'pick', 'data-cat': i.category },
      h('span', { class: 'kicker' }, TOPICS[i.category] || cap(i.category), ' · ', ai.life_skill ? 'Try this' : 'Did you know?'),
      h('h3', null, ai.life_skill || ai.fact || ai.headline),
      h('p', null, ai.headline),
      h('div', { class: 'card-foot' }, sourceLinks(i), meter(ai.confidence)));
  }

  function paperRow(p) {
    return h('div', { class: 'paper' },
      link(p.url, p.title) || p.title,
      h('div', { class: 'small' }, h('span', { class: 'kind' }, p.kind === 'preprint' ? 'preprint' : p.kind || 'paper'), ' ',
        [p.source_name, fmtDate(p.published)].filter(Boolean).join(' · '),
        p.alphaxiv ? [' · ', link(p.alphaxiv, 'alphaXiv')] : null));
  }

  function emptyState() {
    const feed = state.feed;
    if (state.view === 'saved' && !state.saved.length) return h('div', { class: 'empty' }, h('strong', null, 'Nothing saved yet. '), 'Use ☆ Save on any card to keep it here. Saved items stay in this browser only.');
    if (!feed || !feed.generated_at) {
      return h('div', { class: 'empty' }, h('strong', null, 'The first digest has not run yet. '),
        'It is generated each morning by a scheduled job. Until then, “Where this comes from” lists the sources it will read.');
    }
    if (state.view === 'papers' && !((state.papers && state.papers.items) || []).length) return h('div', { class: 'empty' }, 'No paper list yet. It is written by the next daily run.');
    if (!(feed.items || []).length && state.view !== 'papers' && state.view !== 'saved') {
      return h('div', { class: 'empty' }, h('strong', null, 'No summaries yet. '),
        (feed.errors && feed.errors[0]) || 'The summariser did not return any items.', ' Try “All papers” for today’s raw list.');
    }
    return h('div', { class: 'empty' }, 'Nothing matches. ', h('button', { type: 'button', class: 'link-button', onclick: resetFilters }, 'Clear filters'));
  }

  // ---- Rendering --------------------------------------------------------------------------

  function renderPicks() {
    const box = $('picks');
    const feed = state.feed;
    const latest = feed && feed.date;
    const filtered = state.topic || state.dayItems || filters().q || filters().src || filters().conf;
    const pool = ((feed && feed.items) || []).filter((i) => i.ai && i.digest_date === latest && (i.ai.life_skill || i.ai.fact) && i.ai.confidence !== 'low');
    pool.sort((a, b) => (LEVEL[b.ai.confidence] - LEVEL[a.ai.confidence]) || ((b.also_in || []).length - (a.also_in || []).length));
    const picks = [];
    const cats = new Set();
    for (const i of pool) {
      if (picks.length === 3) break;
      if (cats.has(i.category)) continue;
      cats.add(i.category);
      picks.push(i);
    }
    box.hidden = !!filtered || state.view === 'papers' || state.view === 'saved' || picks.length < 2;
    $('picks-list').replaceChildren(...picks.map(pick));
  }

  function renderTopics() {
    const f = filters();
    const pool = state.view === 'papers' ? [] : baseItems().filter((i) => viewMatch(i, state.view) && matches(i, f, true));
    const counts = {};
    for (const i of pool) counts[i.category] = (counts[i.category] || 0) + 1;
    const chip = (key, label, n) => h('button', { type: 'button', class: 'topic', 'data-cat': key || null, 'aria-pressed': String(state.topic === key), onclick: () => { state.topic = state.topic === key && key ? '' : key; syncHash(); render(true); } },
      key ? h('span', { class: 'dot', 'aria-hidden': 'true' }) : null, label, h('span', { class: 'n' }, String(n)));
    $('topics').hidden = state.view === 'papers';
    $('topics').replaceChildren(chip('', 'All', pool.length),
      ...Object.keys(TOPICS).filter((k) => counts[k] || state.topic === k).map((k) => chip(k, TOPICS[k], counts[k] || 0)));
  }

  function updateCounts() {
    const f = filters();
    const pool = (state.dayItems || (state.feed && state.feed.items) || []).filter((i) => i && i.ai && matches(i, f));
    const n = { skills: pool.filter((i) => i.ai.life_skill).length, facts: pool.filter((i) => i.ai.fact).length, headlines: pool.length, saved: state.saved.length };
    for (const el of document.querySelectorAll('[data-count]')) el.textContent = n[el.dataset.count] ? String(n[el.dataset.count]) : '';
  }

  function render(reset) {
    const box = $('results');
    const isPapers = state.view === 'papers';
    const list = isPapers ? papers() : items();
    const step = isPapers ? PAGE.papers : PAGE.cards;
    if (reset) { box.replaceChildren(); state.shown = 0; }
    box.classList.toggle('list', isPapers);
    const next = list.slice(state.shown, state.shown + step);
    if (isPapers) box.append(...next.map(paperRow));
    else {
      // Group cards under day headings, continuing the last group across pages.
      let grid = box.lastElementChild && box.lastElementChild.classList.contains('grid') ? box.lastElementChild : null;
      let current = grid ? grid.dataset.day : null;
      for (const i of next) {
        const day = state.view === 'saved' ? 'saved' : i.digest_date || '';
        if (day !== current || !grid) {
          current = day;
          if (state.view !== 'saved') box.append(h('h2', { class: 'day' }, dayLabel(day)));
          grid = h('div', { class: 'grid', 'data-day': day });
          box.append(grid);
        }
        grid.append(card(i, state.view === 'saved' ? (i.ai.life_skill ? 'skills' : 'headlines') : state.view));
      }
    }
    state.shown += next.length;
    if (!list.length) box.replaceChildren(emptyState());
    $('count').textContent = list.length ? `Showing ${state.shown} of ${list.length}` : '';
    $('more').hidden = state.shown >= list.length;
    for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
    $('f-confidence').disabled = $('f-day').disabled = isPapers;
    const active = [$('f-day').value, $('f-confidence').value, $('f-source').value].filter(Boolean).length;
    $('more-filters').querySelector('summary').textContent = active ? `Filters (${active})` : 'Filters';
    $('more-filters').querySelector('summary').classList.toggle('active-filters', !!active);
    if (reset) { renderTopics(); renderPicks(); updateCounts(); }
  }

  function fillSelect(sel, values, label) {
    const keep = sel.value;
    sel.replaceChildren(sel.options[0]);
    for (const v of values) sel.append(h('option', { value: v }, label ? label(v) : v));
    sel.value = values.includes(keep) ? keep : '';
  }

  function refreshSources() {
    const pool = state.view === 'papers' ? (state.papers && state.papers.items) || [] : baseItems();
    fillSelect($('f-source'), [...new Set(pool.map((i) => i.source_name))].sort());
  }

  function renderSourceHealth(feed) {
    const groups = {};
    for (const s of feed.sources || []) (groups[s.group || 'Other'] = groups[s.group || 'Other'] || []).push(s);
    $('source-list').replaceChildren(...Object.entries(groups).map(([g, list]) => h('div', { class: 'source-group' },
      h('h3', null, g),
      h('ul', null, list.map((s) => h('li', null, link(s.home, s.name) || s.name, ' — ',
        s.ok ? `${s.count} new item${s.count === 1 ? '' : 's'}` : s.ok === null ? 'not checked yet' : h('span', { class: 'bad', title: s.error || '' }, 'unavailable today')))))));
  }

  function renderStats(feed) {
    const sources = feed.sources || [];
    const checked = sources.filter((s) => s.ok !== null).length;
    const values = feed.generated_at
      ? [(feed.stats && feed.stats.unique) || 0, `${sources.filter((s) => s.ok).length}/${checked}`, (feed.stats && feed.stats.summarised) || 0]
      : ['—', `0/${sources.length}`, '—'];
    $('stats').querySelectorAll('dd').forEach((dd, k) => {
      dd.classList.remove('skeleton-text');
      dd.textContent = typeof values[k] === 'number' ? values[k].toLocaleString() : values[k];
    });
    const s = feed.stats || {};
    $('meta').textContent = feed.generated_at
      ? `Updated ${new Date(feed.generated_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}${s.parallel_agents ? ` · ${s.model_calls} AI agents, up to ${s.parallel_agents} at once` : ''}${feed.model ? ` · ${feed.model}` : ''}`
      : 'The daily digest has not run yet.';
  }

  function skeleton() {
    const grid = h('div', { class: 'grid', 'aria-hidden': 'true' });
    for (let k = 0; k < 6; k++) grid.append(h('div', { class: 'card skeleton' }));
    $('results').replaceChildren(grid);
  }

  async function loadDay(date) {
    state.dayItems = null;
    if (date) {
      const inFeed = (state.feed.items || []).filter((i) => i.digest_date === date);
      if (inFeed.length) state.dayItems = inFeed;
      else {
        try {
          state.archive[date] = state.archive[date] || await getJson(`data/archive/${encodeURIComponent(date)}.json`);
          state.dayItems = state.archive[date].items || [];
        } catch { state.dayItems = []; }
      }
    }
    refreshSources();
    render(true);
  }

  async function setView(view) {
    state.view = VIEWS.includes(view) ? view : 'skills';
    if (state.view === 'papers' && !state.papers) {
      skeleton();
      try { state.papers = await getJson('data/papers.json'); } catch { state.papers = { items: [] }; }
    }
    refreshSources();
    syncHash();
    render(true);
  }

  function resetFilters() {
    state.topic = '';
    $('f-search').value = '';
    $('f-confidence').value = '';
    $('f-source').value = '';
    if ($('f-day').value) { $('f-day').value = ''; loadDay(''); } else render(true);
    syncHash();
  }

  // Shareable state: #view=facts&topic=health&q=sleep
  function syncHash() {
    const p = new URLSearchParams();
    if (state.view !== 'skills') p.set('view', state.view);
    if (state.topic) p.set('topic', state.topic);
    const q = $('f-search').value.trim();
    if (q) p.set('q', q);
    const hash = p.toString();
    try { history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search); } catch { /* file:// */ }
  }

  async function init() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (TOPICS[p.get('topic')]) state.topic = p.get('topic');
    if (p.get('q')) $('f-search').value = p.get('q').slice(0, 100);
    skeleton();
    try { state.feed = await getJson('data/feed.json'); } catch { state.feed = { items: [] }; }
    const feed = state.feed;
    renderStats(feed);
    let days = [...new Set((feed.items || []).map((i) => i.digest_date).filter(Boolean))];
    try {
      const index = await getJson('data/archive/index.json');
      days = [...new Set([...days, ...(index.days || []).map((d) => d.date)])];
    } catch { /* archive optional */ }
    fillSelect($('f-day'), days.sort().reverse(), fmtDate);
    renderSourceHealth(feed);
    await setView(p.get('view') || 'skills');
  }

  document.addEventListener('DOMContentLoaded', () => {
    for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => setView(b.dataset.view));
    for (const id of ['f-confidence', 'f-source']) $(id).addEventListener('change', () => render(true));
    $('f-day').addEventListener('change', (e) => loadDay(e.target.value));
    $('reset').addEventListener('click', resetFilters);
    let t;
    $('f-search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { syncHash(); render(true); }, 150); });
    $('more').addEventListener('click', () => render(false));
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); $('f-search').focus(); }
      if (e.key === 'Escape' && $('more-filters').open) $('more-filters').open = false;
    });
    document.addEventListener('click', (e) => { if ($('more-filters').open && !$('more-filters').contains(e.target)) $('more-filters').open = false; });
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('/sw.js').catch(() => {});
    init();
  });
})();

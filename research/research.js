/* Discover page: renders the daily research digest from research/data/*.json.
 * All feed and model text is untrusted, so the DOM is built with textContent
 * and only http(s) links are rendered. Nothing is stored or sent anywhere. */
(function () {
  'use strict';

  const TOPIC_LABELS = {
    health: 'Health', mind: 'Mind & wellbeing', learning: 'Learning', thinking: 'Thinking & decisions', money: 'Money',
    work: 'Work', relationships: 'Relationships', digital: 'Digital life', safety: 'Safety', environment: 'Environment', world: 'The world',
  };
  const PAGE = { cards: 30, papers: 100 };
  const state = { view: 'skills', feed: null, papers: null, archive: {}, dayItems: null, shown: 0 };
  const $ = (id) => document.getElementById(id);

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else el.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null && c !== '') el.append(c instanceof Node ? c : String(c));
    return el;
  }

  const safeHref = (u) => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch { return null; } };
  const link = (href, text) => { const s = safeHref(href); return s ? h('a', { href: s, rel: 'noopener noreferrer', target: '_blank' }, text) : null; };
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
  const fmtDate = (d) => { if (!d) return ''; const t = new Date(`${d}T12:00:00Z`); return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };

  async function getJson(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return res.json();
  }

  // ---- Filtering --------------------------------------------------------------

  function items() {
    const all = state.dayItems || (state.feed && state.feed.items) || [];
    const cat = $('f-category').value;
    const conf = $('f-confidence').value;
    const src = $('f-source').value;
    const q = $('f-search').value.trim().toLowerCase();
    return all.filter((i) => {
      if (!i.ai) return false;
      if (state.view === 'skills' && !i.ai.life_skill) return false;
      if (state.view === 'facts' && !i.ai.fact) return false;
      if (cat && i.category !== cat) return false;
      if (src && i.source_name !== src) return false;
      if (conf === 'high' && i.ai.confidence !== 'high') return false;
      if (conf === 'moderate' && i.ai.confidence === 'low') return false;
      if (conf === 'reviewed' && i.kind === 'preprint') return false;
      if (q && !`${i.title} ${i.ai.headline} ${i.ai.summary} ${i.ai.life_skill} ${i.ai.fact} ${i.source_name}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function papers() {
    const all = (state.papers && state.papers.items) || [];
    const src = $('f-source').value;
    const q = $('f-search').value.trim().toLowerCase();
    return all.filter((p) => (!src || p.source_name === src) && (!q || `${p.title} ${p.source_name}`.toLowerCase().includes(q)));
  }

  // ---- Rendering ----------------------------------------------------------------

  function chips(i) {
    const conf = i.ai.confidence;
    return h('div', { class: 'chips' },
      h('span', { class: 'chip' }, TOPIC_LABELS[i.category] || i.category),
      h('span', { class: `chip ${conf === 'low' ? 'low' : ''}`.trim(), title: 'How much weight the evidence can bear' }, `${cap(conf)} confidence`),
      h('span', { class: 'chip kind' }, i.kind === 'preprint' ? 'Preprint · not peer reviewed' : cap(i.ai.evidence)));
  }

  function sourceLinks(i) {
    const links = [link(i.url, `${i.source_name} ↗`)];
    if (i.links && i.links.alphaxiv) links.push(link(i.links.alphaxiv, 'Discuss on alphaXiv'));
    if (i.links && i.links.pubmed && i.links.pubmed !== i.url) links.push(link(i.links.pubmed, 'PubMed'));
    for (const a of i.also_in || []) links.push(link(a.url, `Also in ${a.source_name}`));
    return h('div', { class: 'links' }, links.filter(Boolean), h('span', { class: 'small' }, fmtDate(i.published || i.digest_date)));
  }

  function card(i) {
    const ai = i.ai;
    const lead = state.view === 'skills' ? ai.life_skill : state.view === 'facts' ? ai.fact : ai.headline;
    return h('article', { class: 'card' },
      chips(i),
      h('h2', null, lead),
      state.view !== 'headlines' ? h('p', { class: 'lead' }, ai.headline) : null,
      h('p', null, ai.summary),
      ai.why_it_matters ? h('p', { class: 'small' }, h('strong', null, 'Why it matters: '), ai.why_it_matters) : null,
      ai.caveat ? h('p', { class: 'caveat' }, h('strong', null, 'Caveat: '), ai.caveat) : null,
      h('p', { class: 'small' }, 'Paper: ', i.title),
      sourceLinks(i));
  }

  function paperRow(p) {
    return h('div', { class: 'paper' },
      link(p.url, p.title) || p.title,
      h('div', { class: 'small' }, [p.source_name, p.kind === 'preprint' ? 'preprint' : p.kind, fmtDate(p.published)].filter(Boolean).join(' · '),
        p.alphaxiv ? [' · ', link(p.alphaxiv, 'alphaXiv')] : null));
  }

  function emptyState() {
    const feed = state.feed;
    if (!feed || !feed.generated_at) {
      return h('div', { class: 'empty' }, h('strong', null, 'The first digest has not run yet. '),
        'It is generated each morning by a scheduled job. Until then, the source list below shows where papers will come from.');
    }
    if (state.view === 'papers' && !((state.papers && state.papers.items) || []).length) {
      return h('div', { class: 'empty' }, 'No paper list yet. It is written by the next daily run.');
    }
    if (!(feed.items || []).length && state.view !== 'papers') {
      return h('div', { class: 'empty' }, h('strong', null, 'No summaries yet. '),
        (feed.errors && feed.errors[0]) || 'The summariser did not return any items.', ' Try “All new papers” for today’s raw list.');
    }
    return h('div', { class: 'empty' }, 'Nothing matches these filters. Try another topic, day or search.');
  }

  function render(reset) {
    const box = $('results');
    const list = state.view === 'papers' ? papers() : items();
    const step = state.view === 'papers' ? PAGE.papers : PAGE.cards;
    if (reset) { box.replaceChildren(); state.shown = 0; }
    box.classList.toggle('list', state.view === 'papers');
    const next = list.slice(state.shown, state.shown + step);
    box.append(...next.map(state.view === 'papers' ? paperRow : card));
    state.shown += next.length;
    if (!list.length) box.replaceChildren(emptyState());
    $('count').textContent = list.length ? `Showing ${state.shown} of ${list.length}` : '';
    $('more').hidden = state.shown >= list.length;
    for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
    $('f-category').disabled = $('f-confidence').disabled = $('f-day').disabled = state.view === 'papers';
  }

  function fillSelect(sel, values, label) {
    const keep = sel.value;
    sel.replaceChildren(sel.options[0]);
    for (const v of values) sel.append(h('option', { value: v }, label ? label(v) : v));
    sel.value = values.includes(keep) ? keep : '';
  }

  function refreshSources() {
    const pool = state.view === 'papers' ? (state.papers && state.papers.items) || [] : (state.dayItems || (state.feed && state.feed.items) || []);
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

  async function init() {
    try {
      state.feed = await getJson('data/feed.json');
    } catch {
      state.feed = { items: [] };
    }
    const feed = state.feed;
    const ok = (feed.sources || []).filter((s) => s.ok).length;
    const checked = (feed.sources || []).filter((s) => s.ok !== null).length;
    $('meta').textContent = feed.generated_at
      ? `Updated ${new Date(feed.generated_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · ${ok} of ${checked} sources reached · ${feed.stats ? feed.stats.unique : 0} new papers scanned${feed.model ? ` · summaries by ${feed.model}` : ''}`
      : 'The daily digest has not run yet.';
    fillSelect($('f-category'), Object.keys(TOPIC_LABELS).filter((k) => (feed.items || []).some((i) => i.category === k)), (k) => TOPIC_LABELS[k]);
    let days = [...new Set((feed.items || []).map((i) => i.digest_date).filter(Boolean))];
    try {
      const index = await getJson('data/archive/index.json');
      days = [...new Set([...days, ...(index.days || []).map((d) => d.date)])];
    } catch { /* archive optional */ }
    fillSelect($('f-day'), days.sort().reverse(), fmtDate);
    renderSourceHealth(feed);
    refreshSources();
    render(true);
  }

  document.addEventListener('DOMContentLoaded', () => {
    for (const b of document.querySelectorAll('.tabs button')) {
      b.addEventListener('click', async () => {
        state.view = b.dataset.view;
        if (state.view === 'papers' && !state.papers) {
          try { state.papers = await getJson('data/papers.json'); } catch { state.papers = { items: [] }; }
        }
        refreshSources();
        render(true);
      });
    }
    for (const id of ['f-category', 'f-confidence', 'f-source']) $(id).addEventListener('change', () => render(true));
    $('f-day').addEventListener('change', (e) => loadDay(e.target.value));
    let t;
    $('f-search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => render(true), 150); });
    $('more').addEventListener('click', () => render(false));
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('/sw.js').catch(() => {});
    init();
  });
})();

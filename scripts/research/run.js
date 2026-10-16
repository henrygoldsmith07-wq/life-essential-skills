#!/usr/bin/env node
// Daily research digest: fetch recent work from every source, de-duplicate,
// pick the most life-relevant papers, summarise them with OpenRouter, and
// write static JSON the /research/ page reads.
//
//   node scripts/research/run.js [--days 2] [--max 40] [--concurrency 10] [--only arxiv,pubmed] [--no-ai]
//
// One agent (model call) per paper, run in parallel under a shared rate
// limit and daily budget: OPENROUTER_RPM (default 18 per minute) and
// OPENROUTER_DAILY_REQUESTS (default 48, the no-credit free tier is 50).
//
// Env: OPENROUTER_API_KEY (required for summaries), OPENROUTER_MODEL,
// CONTACT_EMAIL, NCBI_API_KEY, S2_API_KEY, OPENALEX_API_KEY (all optional).
'use strict';

const fs = require('fs');
const path = require('path');
const { dedupe, select, daysAgo } = require('./lib');
const { SOURCES } = require('./sources');
const { summarise, DEFAULT_MODEL } = require('./summarise');

const ROOT = path.resolve(__dirname, '../..');
const OUT = process.env.RESEARCH_OUT ? path.resolve(process.env.RESEARCH_OUT) : path.join(ROOT, 'research', 'data');
const FEED_DAYS = 30; // rolling window shown on the page
const FEED_CAP = 800;
const PAPERS_CAP = 2500;
const SEEN_DAYS = 90;

function args(argv) {
  const opts = { days: 2, max: 40, concurrency: 10, only: null, ai: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--days') opts.days = Number(next());
    else if (a === '--max') opts.max = Number(next());
    else if (a === '--concurrency') opts.concurrency = Number(next());
    else if (a === '--only') opts.only = new Set(String(next()).split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--no-ai') opts.ai = false;
    else if (a === '--init') opts.init = true;
  }
  const bounded = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
  opts.days = bounded(opts.days, 1, 60, 2);
  opts.max = bounded(opts.max, 1, 1000, 40);
  opts.concurrency = bounded(opts.concurrency, 1, 64, 10);
  return opts;
}

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 1)}\n`);
};

async function pool(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }));
  return results;
}

async function fetchAll(sources, ctx, log) {
  return pool(sources.map((s) => async () => {
    const started = Date.now();
    try {
      const items = await s.fetch(ctx);
      log(`${s.name.padEnd(48)} ${String(items.length).padStart(4)} items  ${Date.now() - started}ms`);
      return { source: s, items, ok: true };
    } catch (e) {
      log(`${s.name.padEnd(48)} FAILED  ${e.message}`);
      return { source: s, items: [], ok: false, error: String(e.message || e).slice(0, 200) };
    }
  }), 6);
}

// Ids already summarised recently, so the same paper is not repeated daily.
function seenIds(feed, archiveIndex, today) {
  const seen = new Set((feed.items || []).map((i) => i.id));
  const cutoff = daysAgo(SEEN_DAYS, new Date(`${today}T12:00:00Z`));
  for (const day of archiveIndex.days || []) {
    if (day.date < cutoff) continue;
    for (const item of readJson(path.join(OUT, 'archive', `${day.date}.json`), { items: [] }).items || []) seen.add(item.id);
  }
  return seen;
}

const strip = (item) => {
  const { _score, _category, abstract, ...rest } = item;
  return { ...rest, category: item.category || _category || 'world', excerpt: abstract ? abstract.slice(0, 600) : '' };
};

const registry = (extra = () => ({})) => SOURCES.map((s) => ({ id: s.id, name: s.name, kind: s.kind, group: s.group, home: s.home, ...extra(s) }));

// Seed empty data files (before the first scheduled run) so the page renders
// its honest "not run yet" state and lists every source.
function init() {
  const feedFile = path.join(OUT, 'feed.json');
  const feed = readJson(feedFile, null);
  if (!feed || !feed.generated_at) writeJson(feedFile, { schema: 1, generated_at: null, sources: registry(() => ({ ok: null, count: 0 })), items: [] });
  if (!fs.existsSync(path.join(OUT, 'papers.json'))) writeJson(path.join(OUT, 'papers.json'), { schema: 1, generated_at: null, items: [] });
  if (!fs.existsSync(path.join(OUT, 'archive', 'index.json'))) writeJson(path.join(OUT, 'archive', 'index.json'), { schema: 1, days: [] });
}

async function main(argv = process.argv.slice(2), log = (...m) => console.log(...m)) {
  const opts = args(argv);
  if (opts.init) return init();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const ctx = {
    from: daysAgo(opts.days, now),
    to: today,
    feedFrom: daysAgo(Math.max(opts.days, 3), now),
    weekFrom: daysAgo(Math.max(opts.days, 7), now),
    env: process.env,
  };
  const sources = SOURCES.filter((s) => !opts.only || opts.only.has(s.id));
  log(`Fetching ${sources.length} sources for ${ctx.from} → ${ctx.to}`);

  const results = await fetchAll(sources, ctx, log);
  const all = dedupe(results.flatMap((r) => r.items));
  const feedFile = path.join(OUT, 'feed.json');
  const indexFile = path.join(OUT, 'archive', 'index.json');
  const feed = readJson(feedFile, { items: [] });
  const archiveIndex = readJson(indexFile, { days: [] });
  const seen = seenIds(feed, archiveIndex, today);
  const fresh = all.filter((i) => !seen.has(i.id));
  const general = new Set(SOURCES.filter((s) => s.general).map((s) => s.id));
  const picked = select(fresh, opts.max, general);
  log(`\n${all.length} unique items, ${fresh.length} not yet summarised, ${picked.length} selected for summaries`);

  const key = opts.ai ? process.env.OPENROUTER_API_KEY : '';
  const num = (name) => (process.env[name] ? Number(process.env[name]) : undefined);
  const ai = await summarise(picked, {
    key, log, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL, concurrency: opts.concurrency,
    rpm: num('OPENROUTER_RPM'), dailyRequests: num('OPENROUTER_DAILY_REQUESTS'), windowMs: num('RESEARCH_WINDOW_MS'), backoffMs: num('RESEARCH_BACKOFF_MS'),
  });
  log(`${ai.items.length} summaries from ${ai.calls} model calls (peak ${ai.peak || 0} agents in parallel)${ai.errors.length ? `; errors: ${ai.errors.join(' | ')}` : ''}`);

  const byId = new Map(results.map((r) => [r.source.id, r]));
  const sourceStatus = registry((s) => {
    const r = byId.get(s.id);
    return r ? { ok: r.ok, count: r.items.length, ...(r.error ? { error: r.error } : {}) } : { ok: null, count: 0 };
  });
  const run = {
    generated_at: now.toISOString(),
    date: today,
    window: { from: ctx.from, to: ctx.to },
    model: ai.model,
    stats: { sources: sources.length, sources_ok: results.filter((r) => r.ok).length, fetched: results.reduce((a, r) => a + r.items.length, 0), unique: all.length, selected: picked.length, summarised: ai.items.length, model_calls: ai.calls, parallel_agents: ai.peak || 0 },
    errors: ai.errors.slice(0, 5),
  };

  const todays = ai.items.map((i) => ({ ...strip(i), digest_date: today }));
  if (todays.length) {
    const archiveFile = path.join(OUT, 'archive', `${today}.json`);
    const prior = readJson(archiveFile, { items: [] }).items || [];
    const merged = [...todays, ...prior.filter((p) => !todays.some((t) => t.id === p.id))];
    writeJson(archiveFile, { schema: 1, ...run, items: merged });
    const days = (archiveIndex.days || []).filter((d) => d.date !== today);
    days.unshift({ date: today, count: merged.length });
    days.sort((a, b) => b.date.localeCompare(a.date));
    writeJson(indexFile, { schema: 1, days });
  }

  const cutoff = daysAgo(FEED_DAYS, now);
  const kept = [...todays, ...(feed.items || []).filter((i) => i.digest_date >= cutoff && !todays.some((t) => t.id === i.id))].slice(0, FEED_CAP);
  writeJson(feedFile, { schema: 1, ...run, sources: sourceStatus, items: kept });

  // Every fetched item (titles and links only) so readers can browse beyond the digest.
  writeJson(path.join(OUT, 'papers.json'), {
    schema: 1, generated_at: run.generated_at, window: run.window,
    items: all.sort((a, b) => (b.published || '').localeCompare(a.published || '')).slice(0, PAPERS_CAP).map((i) => ({
      id: i.id, title: i.title, url: i.url, source_name: i.source_name, kind: i.kind, published: i.published,
      ...(i.links.alphaxiv ? { alphaxiv: i.links.alphaxiv } : {}),
    })),
  });

  log(`\nWrote research/data (feed: ${kept.length} items, papers: ${Math.min(all.length, PAPERS_CAP)})`);
  if (!run.stats.sources_ok) {
    console.error('No source could be reached.');
    process.exitCode = 1;
  }
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });

module.exports = { main, args, seenIds, strip };

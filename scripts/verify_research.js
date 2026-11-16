// Product-level contracts for the Discover page and its committed digest.
// tests/research.test.js mocks the network for the pipeline; this checks the
// real committed data and the page that renders it. Node built-ins only.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const load = (p) => JSON.parse(read(p));
let fail = 0;
const check = (name, cond) => {
  if (!cond) fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
};
const isHttp = (u) => { try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; } };
const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));

const feed = load('research/data/feed.json');
const papers = load('research/data/papers.json');
const archive = load('research/data/archive/index.json');
const html = read('research/index.html');
const js = read('research/research.js');

// ---- Committed digest ------------------------------------------------------

check('feed schema version 1', feed.schema === 1);
check('feed has a valid date, generated time and window', isDay(feed.date) && !!feed.generated_at && isDay(feed.window && feed.window.from) && isDay(feed.window && feed.window.to));
check('feed has items', Array.isArray(feed.items) && feed.items.length > 0);

const stats = feed.stats || {};
check('run stats are internally consistent', stats.sources_ok <= stats.sources && stats.summarised <= stats.selected && stats.selected <= stats.unique && stats.unique <= stats.fetched && stats.fetched > 0);
check('sources are well formed', Array.isArray(feed.sources) && feed.sources.length > 0 && feed.sources.every((s) => s.id && s.name && (typeof s.ok === 'boolean' || s.ok === null) && (s.ok !== null || !!s.requires)));
check('source health count matches the source list', stats.sources_ok === feed.sources.filter((s) => s.ok).length);
check('run errors are recorded as a list', Array.isArray(feed.errors));
// A partially working run is still honest, but a run that reached almost no
// sources or summarised almost nothing is degradation the push-only page check
// would otherwise treat as a healthy digest. These are data-only, so they run
// on every push without depending on the clock.
check('generated_at is on the digest day', (feed.generated_at || '').slice(0, 10) === feed.date);
check('the run reached most sources', stats.sources_ok >= Math.ceil(stats.sources * 0.5));
check('most selected items were summarised', stats.summarised >= Math.ceil(stats.selected * 0.5));

const items = feed.items || [];
const levels = ['low', 'moderate', 'high'];
const providers = ['nvidia', 'groq', 'openrouter', 'cloudflare', 'cerebras'];
check('every item has identity, source, category and date', items.every((i) => i.id && i.title && isHttp(i.url) && i.source_name && i.kind && i.category && isDay(i.digest_date)));
check('every item has an attributed AI summary', items.every((i) => i.ai && i.ai.headline && i.ai.summary && levels.includes(i.ai.confidence) && i.ai.model && providers.includes(i.ai.provider)));
check('preprints are never labelled high confidence', items.every((i) => i.kind !== 'preprint' || i.ai.confidence !== 'high'));
check('AI text is shaped for the four views', items.every((i) => !('life_skill' in i.ai) || typeof i.ai.life_skill === 'string') && items.every((i) => !('fact' in i.ai) || typeof i.ai.fact === 'string') && items.every((i) => !i.ai.quiz || (i.ai.quiz.question && i.ai.quiz.answer)));
check('all rendered links are http(s)', items.every((i) => Object.values(i.links || {}).every(isHttp) && (i.also_in || []).every((a) => isHttp(a.url)) && (!i.links || !i.links.alphaxiv || isHttp(i.links.alphaxiv))));
const topicsBlock = (js.match(/const TOPICS = \{([\s\S]*?)\n  \};/) || [])[1] || '';
const topics = [...topicsBlock.matchAll(/([a-z]+):\s*'/g)].map((m) => m[1]);
check('feed categories map to a rendered topic', topics.length >= 10 && items.every((i) => topics.includes(i.category)));

check('papers list has linkable rows', Array.isArray(papers.items) && papers.items.length > 0 && papers.items.every((p) => p.id && p.title && isHttp(p.url)));

const days = (archive.days || []).map((d) => d.date);
check('archive index lists unique valid days', days.length > 0 && days.every(isDay) && new Set(days).size === days.length);
check('latest archive day is the feed date', days.includes(feed.date) && days.slice().sort().pop() === feed.date);
check('archive files exist and parse', days.every((d) => { try { const a = load(`research/data/archive/${d}.json`); return Array.isArray(a.items); } catch { return false; } }));
check('archive is within its 180-day retention window', days.every((d) => (Date.parse(`${feed.date}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86400000 <= 180));

// ---- Rendered page ---------------------------------------------------------

check('page loads its own script and stylesheet', /<script src="research\.js" defer><\/script>/.test(html) && /href="research\.css"/.test(html));
check('page names the AI authors and the limit of the summaries', /AI-written summaries/.test(html) && /not medical, financial or legal advice/.test(html));
check('page marks preprints as not peer reviewed', /Preprints are not yet peer reviewed/.test(html) && /<noscript>/.test(html) && /data\/feed\.json/.test(html));
check('page has a skip link and a live status', /class="skip" href="#results"/.test(html) && /id="meta"[^>]*role="status"/.test(html));
check('all six views are exposed as buttons', ['skills', 'facts', 'headlines', 'quiz', 'saved', 'papers'].every((v) => html.includes(`data-view="${v}"`)));

check('untrusted text is never assigned as HTML', !/\.innerHTML\b/.test(js) && !/document\.write\b/.test(js));
check('external links are noopener and new-tab', /rel: 'noopener noreferrer'/.test(js) && /target: '_blank'/.test(js));
check('link safety allows only http(s)', /x\.protocol === 'https:' \|\| x\.protocol === 'http:'/.test(js));
check('the page never posts or beacons data', !/method:\s*['"]POST['"]/i.test(js) && !/sendBeacon|XMLHttpRequest/i.test(js));
check('saved items are local and capped', /localStorage\.getItem\(SAVED_KEY\)/.test(js) && /localStorage\.setItem\(SAVED_KEY/.test(js) && /slice\(0, 300\)/.test(js));
check('cards show confidence, preprint flag, model and guide link', /\bmeter\(ai\.confidence\)/.test(js) && /'Preprint'/.test(js) && /Summarised by /.test(js) && /guideLink\(i\)/.test(js));
check('run stats name calls and agents separately', /model calls, up to \$\{s\.parallel_agents\} agents at once/.test(js));

const quoted = (s) => [...s.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const guidesBlock = (js.match(/const GUIDES = \{([\s\S]*?)\n  \};/) || [])[1] || '';
const guideFiles = quoted(guidesBlock).filter((s) => s.endsWith('.md'));
check('the page resolves its guide links to real files', guideFiles.length >= 8 && guideFiles.every((f) => fs.existsSync(path.join(ROOT, 'guides', f))));
check('the digest day contributed items', items.some((i) => i.digest_date === feed.date));

// Freshness is deliberately opt-in. A stopped digest produces no commit, so a
// push-only check never sees it; the scheduled freshness job below sets this
// flag. Keeping it out of the push path avoids time-dependent CI failures on
// ordinary pushes. RESEARCH_NOW lets the gate be tested without waiting a day.
if (process.env.RESEARCH_CHECK_FRESHNESS === '1') {
  const todayIso = process.env.RESEARCH_NOW || new Date().toISOString().slice(0, 10);
  const ageDays = isDay(todayIso) ? Math.round((Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${feed.date}T00:00:00Z`)) / 86400000) : NaN;
  check('the committed digest is at most two days old', Number.isFinite(ageDays) && ageDays >= 0 && ageDays <= 2);
}

console.log(fail ? `FAIL ${fail} Discover contract(s)` : 'PASS Discover data and page contracts');
process.exit(fail ? 1 : 0);

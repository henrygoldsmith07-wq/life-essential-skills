// Shared helpers for the daily research digest: tolerant XML/feed parsing,
// item normalisation, de-duplication and life-relevance scoring.
// Node built-ins only (Node 20+: global fetch, AbortSignal.timeout).
'use strict';

const USER_AGENT = 'LifeEssentialSkills-ResearchDigest/1.0 (+https://github.com/henrygoldsmith07-wq/life-essential-skills)';

// ---- Text and XML ----------------------------------------------------------

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return Object.prototype.hasOwnProperty.call(NAMED, e.toLowerCase()) ? NAMED[e.toLowerCase()] : m;
  });
}

const unCdata = (s) => String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
const stripTags = (s) => String(s).replace(/<[^>]*>/g, ' ');
const collapse = (s) => String(s).replace(/\s+/g, ' ').trim();

// Feed text is often HTML escaped inside XML: decode, strip, decode again.
function cleanText(s) {
  if (s == null) return '';
  return collapse(decodeEntities(stripTags(decodeEntities(stripTags(unCdata(s))))));
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Inner XML of every <name ...>...</name> (namespace prefix optional).
function blocks(xml, name) {
  const re = new RegExp(`<(?:[\\w-]+:)?${escapeRe(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${escapeRe(name)}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

const first = (xml, name) => (blocks(xml, name)[0] ?? '');

// Attribute values of every <name ... attr="..."> (self-closing or not).
function attrs(xml, name, attr) {
  const re = new RegExp(`<(?:[\\w-]+:)?${escapeRe(name)}\\b([^>]*)>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(xml))) {
    const a = new RegExp(`\\b${escapeRe(attr)}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(m[1]);
    if (a) out.push({ value: decodeEntities(a[2] ?? a[3]), tag: m[1] });
  }
  return out;
}

// ---- Dates -----------------------------------------------------------------

function isoDate(value) {
  if (!value) return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

const daysAgo = (n, now = new Date()) => new Date(now.getTime() - n * 86400000).toISOString().slice(0, 10);

// ---- Items -----------------------------------------------------------------

const normTitle = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 160);

function normDoi(doi) {
  if (!doi) return '';
  const d = String(doi).trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').toLowerCase();
  return /^10\.\d{4,9}\//.test(d) ? d : '';
}

function safeUrl(u) {
  try {
    const url = new URL(String(u).trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

// Every adapter returns items through this so the feed has one shape.
function makeItem(source, raw) {
  const title = cleanText(raw.title).slice(0, 400);
  const doi = normDoi(raw.doi);
  const url = safeUrl(raw.url) || (doi ? `https://doi.org/${doi}` : '');
  if (!title || !url) return null;
  const id = raw.id || (doi ? `doi:${doi}` : `url:${url}`);
  const links = {};
  for (const [k, v] of Object.entries(raw.links || {})) {
    const s = safeUrl(v);
    if (s) links[k] = s;
  }
  return {
    id,
    title,
    abstract: cleanText(raw.abstract).slice(0, 4000),
    url,
    links,
    doi,
    source: source.id,
    source_name: raw.source_name || source.name,
    kind: raw.kind || source.kind,
    venue: cleanText(raw.venue).slice(0, 200),
    authors: (raw.authors || []).map(cleanText).filter(Boolean).slice(0, 6),
    published: isoDate(raw.published),
  };
}

const dedupeKey = (item) => item.doi ? `doi:${item.doi}` : item.id.startsWith('arxiv:') ? item.id : `t:${normTitle(item.title)}`;

// Merge duplicates across sources: keep the richest record, remember where
// else it appeared so the reader can see independent coverage.
function dedupe(items) {
  const byKey = new Map();
  const byTitle = new Map();
  for (const item of items) {
    const key = dedupeKey(item);
    const tkey = normTitle(item.title);
    const existing = byKey.get(key) || (tkey.length > 24 ? byTitle.get(tkey) : undefined);
    if (!existing) {
      const copy = { ...item, also_in: [] };
      byKey.set(key, copy);
      if (tkey.length > 24) byTitle.set(tkey, copy);
      continue;
    }
    if (existing.source_name !== item.source_name && !existing.also_in.some((a) => a.source_name === item.source_name)) {
      existing.also_in.push({ source_name: item.source_name, url: item.url });
    }
    if (item.abstract.length > existing.abstract.length) existing.abstract = item.abstract;
    if (!existing.doi && item.doi) existing.doi = item.doi;
    if (!existing.published && item.published) existing.published = item.published;
    existing.links = { ...item.links, ...existing.links };
  }
  return [...byKey.values()];
}

// ---- Relevance ---------------------------------------------------------------

// Category → keywords. Used to pre-select papers worth an LLM call (free tier
// allows ~50 requests a day) and as a fallback category.
const TOPICS = {
  health: ['sleep', 'exercise', 'physical activity', 'diet', 'nutrition', 'obesity', 'alcohol', 'smoking', 'vaping', 'blood pressure', 'hypertension', 'diabetes', 'heart', 'cardiovascular', 'cancer', 'screening', 'vaccin', 'antibiotic', 'infection', 'covid', 'influenza', 'pain', 'walking', 'sedentary', 'ultra-processed', 'sugar', 'salt', 'caffeine', 'hydration', 'dental', 'oral health', 'skin', 'sunscreen', 'hearing', 'vision', 'posture', 'fitness', 'strength', 'longevity', 'mortality', 'ageing', 'aging', 'dementia', 'pregnan', 'menopause', 'microbiome', 'supplement', 'vitamin'],
  mind: ['mental health', 'depression', 'anxiety', 'stress', 'loneliness', 'wellbeing', 'well-being', 'happiness', 'mindfulness', 'meditation', 'burnout', 'resilience', 'self-esteem', 'emotion', 'mood', 'suicide', 'therapy', 'psychotherapy', 'cognitive behavio', 'gratitude', 'nature exposure', 'green space'],
  learning: ['learning', 'memory', 'education', 'student', 'reading', 'literacy', 'numeracy', 'retrieval practice', 'spaced', 'attention', 'cognitive', 'intelligence', 'creativity', 'curiosity', 'motivation', 'habit', 'procrastination', 'self-control', 'focus', 'multitask'],
  thinking: ['decision', 'bias', 'misinformation', 'disinformation', 'trust', 'belief', 'reasoning', 'judgment', 'judgement', 'risk perception', 'forecast', 'probability', 'conspiracy', 'critical thinking', 'persuasion', 'polarization', 'polarisation'],
  money: ['financial', 'finance', 'debt', 'saving', 'savings', 'income', 'wage', 'poverty', 'inflation', 'pension', 'retirement', 'credit', 'loan', 'mortgage', 'household', 'cost of living', 'budget', 'investment', 'gambling', 'consumer'],
  work: ['employment', 'unemployment', 'job', 'workplace', 'remote work', 'productivity', 'career', 'labour market', 'labor market', 'worker', 'skills', 'automation', 'wellbeing at work', 'commut'],
  relationships: ['relationship', 'marriage', 'friendship', 'social support', 'parent', 'child', 'adolescent', 'teen', 'family', 'loneliness', 'empathy', 'cooperation', 'kindness', 'conflict', 'communication', 'bullying'],
  digital: ['social media', 'screen time', 'smartphone', 'internet', 'online', 'scam', 'fraud', 'phishing', 'password', 'privacy', 'cybersecurity', 'security', 'deepfake', 'chatbot', 'large language model', 'llm', 'artificial intelligence', 'generative ai', 'algorithm'],
  safety: ['injury', 'road safety', 'accident', 'fire', 'drowning', 'first aid', 'cpr', 'emergency', 'heatwave', 'heat wave', 'air pollution', 'air quality', 'flood', 'earthquake', 'disaster', 'poisoning', 'food safety'],
  environment: ['climate', 'emission', 'carbon', 'biodiversity', 'pollution', 'plastic', 'energy', 'renewable', 'weather', 'ocean', 'forest', 'species', 'extinction', 'water'],
  world: ['universe', 'galaxy', 'planet', 'star', 'black hole', 'evolution', 'ancient', 'archaeolog', 'fossil', 'human origins', 'dinosaur', 'physics', 'quantum', 'mathemat', 'brain', 'genome', 'dna', 'animal', 'bird', 'insect'],
};

const EVIDENCE_BONUS = [
  [/cochrane|systematic review|meta-analy/i, 3],
  [/randomi[sz]ed|controlled trial|\brct\b/i, 2],
  [/cohort|longitudinal|prospective|population-based|nationwide/i, 1],
];

function score(item) {
  const text = `${item.title} ${item.abstract}`.toLowerCase();
  const hits = {};
  for (const [cat, words] of Object.entries(TOPICS)) {
    const n = words.reduce((acc, w) => acc + (text.includes(w) ? 1 : 0), 0);
    if (n) hits[cat] = n;
  }
  const lifeHits = Object.entries(hits).filter(([c]) => c !== 'world').reduce((a, [, n]) => a + n, 0);
  let s = Math.min(lifeHits, 6) * 2 + Math.min(hits.world || 0, 3);
  for (const [re, bonus] of EVIDENCE_BONUS) if (re.test(text)) s += bonus;
  if (item.abstract.length > 200) s += 1;
  s += Math.min(item.also_in ? item.also_in.length : 0, 3);
  const category = Object.entries(hits).sort((a, b) => b[1] - a[1])[0]?.[0] || 'world';
  return { score: s, category };
}

// A protocol describes a study that has not produced results yet.
const PROTOCOL = /\b(study|trial|review|research) protocol\b|\bprotocol for an? (systematic|scoping|randomi[sz]ed|umbrella|rapid|mixed|multi)|^protocol\b/i;

// Round-robin across sources so one prolific server cannot crowd the digest,
// and no topic takes more than `maxShare` of the picks while other topics
// still have candidates (the first live run was over half health).
// Items with no life-relevance signal are only taken from general sources.
function select(items, max, generalSources = new Set(), { maxShare = 0.3 } = {}) {
  const groups = new Map();
  for (const item of items) {
    if (PROTOCOL.test(item.title) || PROTOCOL.test(item.abstract.slice(0, 200))) continue;
    const { score: s, category } = score(item);
    if (s < 2 && !generalSources.has(item.source)) continue;
    item._score = s;
    item._category = category;
    if (!groups.has(item.source)) groups.set(item.source, []);
    groups.get(item.source).push(item);
  }
  for (const g of groups.values()) g.sort((a, b) => b._score - a._score || (b.published || '').localeCompare(a.published || ''));
  const order = [...groups.values()].sort((a, b) => b[0]._score - a[0]._score);
  const cap = Math.max(1, Math.ceil(max * maxShare));
  const perCat = {};
  const picked = [];
  const deferred = [];
  while (picked.length < max && order.some((g) => g.length)) {
    for (const g of order) {
      if (picked.length >= max) break;
      // Take this source's best item from a topic that is not yet full.
      const k = g.findIndex((i) => (perCat[i._category] || 0) < cap);
      if (k < 0) { deferred.push(...g.splice(0)); continue; }
      const [item] = g.splice(k, 1);
      perCat[item._category] = (perCat[item._category] || 0) + 1;
      picked.push(item);
    }
  }
  // Only if every other topic ran dry, fill the remaining slots past the cap.
  deferred.sort((a, b) => b._score - a._score);
  while (picked.length < max && deferred.length) picked.push(deferred.shift());
  return picked;
}

// ---- HTTP ------------------------------------------------------------------

async function fetchText(url, { timeoutMs = 25000, headers = {}, retries = 1 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...headers }, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 429 || res.status >= 500) throw Object.assign(new Error(`HTTP ${res.status}`), { retryable: true });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (attempt < retries && (e.retryable || e.name === 'TimeoutError')) await sleep(2000 * (attempt + 1));
      else break;
    }
  }
  throw lastErr;
}

async function fetchJson(url, opts = {}) {
  const text = await fetchText(url, { ...opts, headers: { Accept: 'application/json', ...(opts.headers || {}) } });
  return JSON.parse(text);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  USER_AGENT, decodeEntities, cleanText, blocks, first, attrs, isoDate, daysAgo, normTitle, normDoi, safeUrl,
  makeItem, dedupe, score, select, fetchText, fetchJson, sleep, TOPICS,
};

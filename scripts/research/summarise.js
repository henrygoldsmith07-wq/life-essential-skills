// Turn selected papers into plain-language life skills, facts and news
// takeaways with a free OpenRouter model. The key comes only from the
// OPENROUTER_API_KEY environment variable (a GitHub Actions secret) and is
// never written to the repository or shipped to the browser.
//
// Each paper gets its own agent (one focused model call with the full
// abstract). Agents run in parallel through a pool, but every request first
// takes a slot from a shared rate limiter and a shared daily budget, because
// free models allow ~20 requests a minute and ~50 a day on an account with no
// credit. A daily-quota, bad-key or no-credit error stops every agent at once.
'use strict';

const { USER_AGENT, sleep, cleanText } = require('./lib');

const API = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'nvidia/nemotron-3.5-super-vl:free';
const DEFAULTS = { concurrency: 10, rpm: 18, dailyRequests: 48, windowMs: 60000 };

const CATEGORIES = ['health', 'mind', 'learning', 'thinking', 'money', 'work', 'relationships', 'digital', 'safety', 'environment', 'world'];
const EVIDENCE = ['systematic review', 'randomised trial', 'observational study', 'lab or animal study', 'modelling', 'qualitative study', 'theory or commentary', 'news report', 'other'];
const CONFIDENCE = ['high', 'moderate', 'low'];

const SYSTEM = `You are the research editor for "Life Essential Skills", a free curriculum that helps people become capable, independent adults.
You read one new piece of research and explain, in plain British English for a curious 16-year-old, what it means for everyday life and for understanding the world.

Rules:
- Use ONLY what the title and abstract say. Never invent numbers, effects, sample sizes or conclusions.
- Be proportionate to the evidence: a single observational study, a preprint (not yet peer reviewed), an animal/cell study or a model is NOT proof. Say so in the caveat and lower the confidence.
- "life_skill" is a small, safe, general habit or way of thinking the reader could try, written as an imperative ("Try…", "Check…", "Notice…"). Leave it empty if the paper does not support one. Never give personal medical, legal or financial instructions, dosages, or advice to change treatment; point to a qualified professional where relevant.
- "fact" is one durable, accurate thing worth knowing about the world that the paper supports (empty if none).
- "quiz" is one short question that checks the reader understood the finding, with a one-sentence answer drawn from the abstract.
- Correlation is not causation: use "is linked to" unless the design is a randomised trial or systematic review of trials.
- Set "keep" to false if there is no takeaway a non-specialist could understand or use.
Reply with one JSON object only, no prose and no code fences.`;

function prompt(p) {
  return `Summarise this paper.

Title: ${p.title}
Source: ${p.source_name}${p.venue && p.venue !== p.source_name ? ` · ${p.venue}` : ''} (${p.kind}${p.kind === 'preprint' ? ', not yet peer reviewed' : ''})
Published: ${p.published || 'unknown'}
Abstract: ${(p.abstract || '(no abstract available — use the title only and set confidence to low)').slice(0, 3500)}

Return exactly this object:
{"keep":true,"category":"one of ${CATEGORIES.join('|')}","headline":"the finding in one plain sentence (max 22 words)","summary":"2-3 plain sentences: what was studied, what was found","why_it_matters":"one sentence on why this matters to everyday life or understanding the world","life_skill":"one actionable sentence or empty string","fact":"one sentence or empty string","key_terms":["up to 3 short terms a reader could look up"],"quiz":{"question":"one short question","answer":"one sentence"},"evidence":"one of ${EVIDENCE.join('|')}","confidence":"high|moderate|low","caveat":"one sentence on the main limitation"}`;
}

// Free models sometimes wrap JSON in fences or reasoning tags; recover the object.
function parseObject(text) {
  const cleaned = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
  const tries = [cleaned];
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) tries.push(cleaned.slice(start, end + 1));
  for (const t of tries) {
    try {
      const v = JSON.parse(t);
      const obj = Array.isArray(v) ? v[0] : Array.isArray(v && v.items) ? v.items[0] : v;
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
    } catch { /* try next */ }
  }
  return null;
}

const clip = (s, n) => {
  const t = cleanText(typeof s === 'string' ? s : '');
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};
const pick = (v, allowed, fallback) => {
  const s = String(v || '').toLowerCase().trim();
  return allowed.find((a) => a === s) || allowed.find((a) => s && (a.startsWith(s) || s.startsWith(a.split(' ')[0]))) || fallback;
};

// Validate one model reply against the schema. Returns null to drop the paper.
function applySummary(paper, row, model) {
  if (!row || row.keep === false) return null;
  const headline = clip(row.headline, 220);
  if (!headline) return null;
  let confidence = pick(row.confidence, CONFIDENCE, 'low');
  if (paper.kind === 'preprint' && confidence === 'high') confidence = 'moderate';
  const quiz = row.quiz && typeof row.quiz === 'object' ? { question: clip(row.quiz.question, 200), answer: clip(row.quiz.answer, 300) } : null;
  return {
    ...paper,
    category: pick(row.category, CATEGORIES, paper._category || 'world'),
    ai: {
      headline,
      summary: clip(row.summary, 700),
      why_it_matters: clip(row.why_it_matters, 300),
      life_skill: clip(row.life_skill, 300),
      fact: clip(row.fact, 300),
      key_terms: (Array.isArray(row.key_terms) ? row.key_terms : []).map((t) => clip(t, 40)).filter(Boolean).slice(0, 3),
      ...(quiz && quiz.question && quiz.answer ? { quiz } : {}),
      evidence: pick(row.evidence, EVIDENCE, 'other'),
      confidence,
      caveat: clip(row.caveat, 300),
      model,
    },
  };
}

// Sliding-window limiter shared by every agent: at most `rpm` requests start
// in any `windowMs`, and at most `budget` requests start in the whole run.
function limiter({ rpm, windowMs, budget }) {
  const starts = [];
  let used = 0;
  let queue = Promise.resolve();
  const take = () => {
    const slot = queue.then(async () => {
      if (used >= budget) return false;
      for (;;) {
        const now = Date.now();
        while (starts.length && now - starts[0] >= windowMs) starts.shift();
        if (starts.length < rpm) break;
        await sleep(windowMs - (now - starts[0]) + 5);
      }
      starts.push(Date.now());
      used++;
      return true;
    });
    queue = slot.catch(() => {});
    return slot;
  };
  return { take, used: () => used };
}

async function api(path, key, body, { timeoutMs = 120000 } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      'HTTP-Referer': process.env.SITE_URL || 'https://github.com/henrygoldsmith07-wq/life-essential-skills',
      'X-Title': 'Life Essential Skills research digest',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { error: { message: text.slice(0, 200) } }; }
  if (!res.ok || json.error) {
    const err = new Error(`OpenRouter ${res.status}: ${json.error?.message || 'error'}`);
    err.status = res.ok ? Number(json.error?.code) || 502 : res.status;
    err.retryAfter = Number(res.headers.get('retry-after')) || 0;
    throw err;
  }
  return json;
}

// Model slugs change; resolve the requested one against OpenRouter's public
// model list and fall back to the closest free Nemotron model if it is gone.
function rankModels(ids, wanted) {
  if (ids.includes(wanted)) return [wanted, ...ids.filter((m) => m !== wanted && /nemotron/i.test(m) && m.endsWith(':free'))];
  const scoreId = (m) => (/super/i.test(m) ? 4 : 0) + (/3[.-]5/.test(m) ? 3 : 0) + (/vl/i.test(m) ? 2 : 0) + (/ultra/i.test(m) ? 1 : 0);
  return ids.filter((m) => /nemotron/i.test(m) && m.endsWith(':free')).sort((a, b) => scoreId(b) - scoreId(a));
}

async function resolveModels(key, wanted, log) {
  try {
    const list = await api('/models', key, null, { timeoutMs: 30000 });
    const ids = (list.data || []).map((m) => m.id);
    const ranked = rankModels(ids, wanted);
    if (ranked[0] !== wanted) log(`model ${wanted} not listed; using ${ranked[0] || wanted}`);
    return ranked.length ? ranked.slice(0, 3) : [wanted];
  } catch (e) {
    log(`could not list models (${e.message}); trying ${wanted}`);
    return [wanted];
  }
}

const fatal = (e) => e.status === 401 || e.status === 402 || (e.status === 429 && /per-day|per day|quota|credits/i.test(e.message));

// One agent: summarise one paper, retrying transient failures and falling
// back through the model list. Returns { item } or { error }.
async function agent(paper, ctx) {
  let lastErr = new Error('daily request budget used up');
  for (const model of ctx.models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (ctx.stopped) return { error: ctx.stopped };
      if (!(await ctx.limit.take())) return { error: 'daily request budget used up' };
      try {
        const json = await api('/chat/completions', ctx.key, {
          model,
          temperature: 0.2,
          max_tokens: 3000,
          messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt(paper) }],
        });
        const used = json.model || model;
        const row = parseObject(json.choices?.[0]?.message?.content);
        if (!row) throw Object.assign(new Error('unparseable reply'), { status: 502 });
        return { item: applySummary(paper, row, used), model: used };
      } catch (e) {
        lastErr = e;
        if (fatal(e)) {
          ctx.stopped = e.message;
          return { error: e.message };
        }
        if (e.status === 404 || e.status === 400) break; // model gone or refused: next model
        await sleep(e.retryAfter ? e.retryAfter * 1000 : ctx.backoffMs * (attempt + 1));
      }
    }
  }
  return { error: lastErr.message };
}

async function summarise(papers, opts = {}) {
  const { key, model = DEFAULT_MODEL, log = console.log } = opts;
  const o = { ...DEFAULTS, backoffMs: 8000, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined && !Number.isNaN(v))) };
  if (!key) return { items: [], model: null, calls: 0, errors: ['OPENROUTER_API_KEY not set — papers listed without AI summaries'] };
  const ctx = { key, models: await resolveModels(key, model, log), limit: limiter({ rpm: o.rpm, windowMs: o.windowMs, budget: o.dailyRequests }), backoffMs: o.backoffMs, stopped: null };
  log(`  ${papers.length} agents, ${o.concurrency} in parallel, ≤${o.rpm} requests per ${o.windowMs / 1000}s, budget ${o.dailyRequests}`);

  const results = new Array(papers.length);
  let next = 0;
  let inFlight = 0;
  let peak = 0;
  await Promise.all(Array.from({ length: Math.min(o.concurrency, papers.length) }, async () => {
    while (next < papers.length) {
      const i = next++;
      inFlight++;
      peak = Math.max(peak, inFlight);
      results[i] = await agent(papers[i], ctx);
      inFlight--;
      if (results[i].error) log(`  ✗ ${papers[i].title.slice(0, 70)} — ${results[i].error}`);
    }
  }));

  const items = results.filter((r) => r && r.item).map((r) => r.item);
  const errors = [...new Set(results.filter((r) => r && r.error).map((r) => r.error))];
  const used = results.find((r) => r && r.model)?.model || ctx.models[0];
  return { items, model: used, calls: ctx.limit.used(), peak, errors };
}

module.exports = { summarise, prompt, parseObject, applySummary, limiter, rankModels, DEFAULT_MODEL, DEFAULTS, CATEGORIES, EVIDENCE };
